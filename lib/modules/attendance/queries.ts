import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import type { BranchScope } from "@/lib/modules/identity/authorization";
import { dateKeyInZone } from "@/lib/platform/date";
import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";
import { resolveScheduleForDate } from "./schedule";

/**
 * Read models for the manager-facing attendance views.
 *
 * Every query takes a BranchScope and applies it in the `where`. A manager
 * reaching another branch's day by editing the URL must come back empty, which
 * filtering after the fetch would not achieve.
 */

/** Flags that mean a person has to look at the day, not just notice it. */
export const BLOCKING_FLAGS = [
  "MISSING_CLOCK_IN",
  "MISSING_CLOCK_OUT",
  "DUPLICATE_CLOCK_IN",
  "UNPAIRED_BREAK",
  "MANUAL_ENTRY",
  "AUTO_CLOSED",
  "UNSCHEDULED",
  "LOW_IDENTITY_ASSURANCE",
] as const;

function scopeWhere(scope: BranchScope) {
  if (scope.kind === "all") return {};
  if (scope.kind === "branches") return { branchId: { in: scope.branchIds } };
  return null;
}

export type DayFilters = {
  /** Local date key, "YYYY-MM-DD". Defaults to today at the caller's end. */
  date: string;
  branchId?: string;
  /** Only days needing attention. */
  exceptionsOnly?: boolean;
};

/**
 * Combines what a reader is allowed to see with what they asked to see.
 *
 * Pure, and separate from the query, for the reason `feedbackListWhere`
 * gives: the dangerous version is one line shorter. Spreading the scope's
 * clause and then the filter's over it —
 *
 *   { ...scopeWhere(scope), ...(branchId ? { branchId } : {}) }
 *
 * — lets a caller-supplied `branchId` REPLACE the scope's own clause instead
 * of narrowing it, so `?branchId=<any other branch>` would show a
 * branch-scoped manager a branch they hold no grant over. `AND`-ing the two
 * clauses cannot do that: a branch outside the scope matches nothing. This
 * was unreachable while every caller of `listAttendanceDays` needed a GLOBAL
 * grant to get here at all; it stops being unreachable the moment a
 * branch-scoped one can.
 */
export function dayWhere(
  scope: BranchScope,
  filters: DayFilters,
): Prisma.AttendanceDayWhereInput | null {
  const scoped = scopeWhere(scope);
  if (scoped === null) return null;

  const clauses: Prisma.AttendanceDayWhereInput[] = [
    scoped,
    { workDate: new Date(`${filters.date}T00:00:00.000Z`) },
  ];
  if (filters.branchId) clauses.push({ branchId: filters.branchId });
  if (filters.exceptionsOnly) clauses.push({ status: "NEEDS_REVIEW" });

  return { AND: clauses };
}

export async function listAttendanceDays(scope: BranchScope, filters: DayFilters) {
  const where = dayWhere(scope, filters);
  if (where === null) return [];

  return prisma.attendanceDay.findMany({
    where,
    orderBy: [{ status: "asc" }, { actualIn: "asc" }],
    select: {
      id: true,
      employeeId: true,
      branchId: true,
      workDate: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      actualIn: true,
      actualOut: true,
      netWorkedMinutes: true,
      overtimeMinutes: true,
      lateMinutes: true,
      earlyDepartureMinutes: true,
      lowestIdentityAssurance: true,
      flags: true,
    },
  });
}

/** Employee names for a set of days, so the list can show people not ids. */
export async function employeeLookup(employeeIds: string[]) {
  const rows = await prisma.employee.findMany({
    where: { id: { in: employeeIds } },
    select: { id: true, employeeCode: true, firstName: true, lastName: true },
  });
  return new Map(rows.map((row) => [row.id, row]));
}

export type DaySummary = {
  total: number;
  needingReview: number;
  late: number;
  stillIn: number;
  overtimeMinutes: number;
};

/** The counts a manager glances at before reading any rows. */
export async function summariseDay(scope: BranchScope, filters: DayFilters): Promise<DaySummary> {
  const days = await listAttendanceDays(scope, { ...filters, exceptionsOnly: false });

  return {
    total: days.length,
    needingReview: days.filter((day) => day.status === "NEEDS_REVIEW").length,
    late: days.filter((day) => day.lateMinutes > 0).length,
    // Clocked in with no clock-out yet: normal mid-shift, an exception after.
    stillIn: days.filter((day) => day.actualIn !== null && day.actualOut === null).length,
    overtimeMinutes: days.reduce((total, day) => total + day.overtimeMinutes, 0),
  };
}

/** One day with the evidence behind it, or null when out of scope. */
export async function getAttendanceDay(
  scope: BranchScope,
  employeeId: string,
  dateKey: string,
) {
  const where = scopeWhere(scope);
  if (where === null) return null;

  const day = await prisma.attendanceDay.findFirst({
    where: { ...where, employeeId, workDate: new Date(`${dateKey}T00:00:00.000Z`) },
  });
  if (!day) return null;

  const [employee, branch, corrections] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
    }),
    prisma.branch.findUnique({ where: { id: day.branchId }, select: { name: true } }),
    prisma.attendanceCorrection.findMany({
      where: { employeeId, workDate: day.workDate },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        operation: true,
        targetEventId: true,
        reasonCode: true,
        reasonText: true,
        correctedBy: true,
        requiresApproval: true,
        approvedBy: true,
        createdAt: true,
      },
    }),
  ]);

  // A generous window: an overnight shift's events sit on two calendar dates.
  const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
  const events = await prisma.attendanceEvent.findMany({
    where: {
      employeeId,
      occurredAt: {
        gte: new Date(dayStart.getTime() - 24 * 60 * 60_000),
        lte: new Date(dayStart.getTime() + 48 * 60 * 60_000),
      },
    },
    orderBy: { occurredAt: "asc" },
    select: {
      id: true,
      direction: true,
      occurredAt: true,
      providerType: true,
      deviceId: true,
      actorUserId: true,
      identityAssurance: true,
      locationAssurance: true,
      timeAssurance: true,
      hintMismatch: true,
      supersedesEventId: true,
      supersededByEventId: true,
      clockSkewMs: true,
      flags: true,
      evidence: {
        select: { manualReasonCode: true, manualReasonText: true, geofenceDecision: true },
      },
    },
  });

  return { day, employee, branchName: branch?.name ?? "Unknown", events, corrections };
}

export type TimesheetFilters = {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  branchId?: string;
  search?: string;
};

export type EmployeeTimesheetRow = {
  employeeId: string;
  employeeCode: string | null;
  name: string;
  branchId: string;
  branchName: string;
  daysScheduled: number;
  daysWorked: number;
  scheduledMinutes: number;
  netWorkedMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  lateCount: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  exceptionsCount: number;
};

export type TimesheetSummaryData = {
  startDate: string;
  endDate: string;
  totalEmployees: number;
  totalScheduledMinutes: number;
  totalWorkedMinutes: number;
  totalRegularMinutes: number;
  totalOvertimeMinutes: number;
  totalLateMinutes: number;
  totalExceptions: number;
  rows: EmployeeTimesheetRow[];
};

/**
 * Builds the where clause for timesheet range queries, enforcing scope.
 */
export function timesheetWhere(
  scope: BranchScope,
  filters: TimesheetFilters,
): Prisma.AttendanceDayWhereInput | null {
  const scoped = scopeWhere(scope);
  if (scoped === null) return null;

  if (filters.branchId && scope.kind === "branches" && !scope.branchIds.includes(filters.branchId)) {
    return null;
  }

  // Sanitize date order
  const start = filters.startDate <= filters.endDate ? filters.startDate : filters.endDate;
  const end = filters.startDate <= filters.endDate ? filters.endDate : filters.startDate;

  const clauses: Prisma.AttendanceDayWhereInput[] = [
    scoped,
    {
      workDate: {
        gte: new Date(`${start}T00:00:00.000Z`),
        lte: new Date(`${end}T00:00:00.000Z`),
      },
    },
  ];

  if (filters.branchId) {
    clauses.push({ branchId: filters.branchId });
  }

  return { AND: clauses };
}

/**
 * Classifies an employee's live floor status given the current time and punches.
 */
export function classifyLiveFloorStatus(params: {
  now: Date;
  actualIn: Date | null;
  actualOut: Date | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
}): { status: LiveFloorStaff["status"]; onDutyMinutes: number } {
  const { now, actualIn, actualOut, scheduledStart, scheduledEnd } = params;

  if (actualIn !== null && actualOut === null) {
    return {
      status: "ON_DUTY",
      onDutyMinutes: Math.max(0, Math.floor((now.getTime() - actualIn.getTime()) / 60_000)),
    };
  }
  if (actualIn !== null && actualOut !== null) {
    return { status: "COMPLETED", onDutyMinutes: 0 };
  }
  if (scheduledStart !== null) {
    if (scheduledEnd !== null && now.getTime() > scheduledEnd.getTime()) {
      return { status: "ABSENT", onDutyMinutes: 0 };
    }
    if (now.getTime() > scheduledStart.getTime() + 15 * 60_000) {
      return { status: "SCHEDULED_LATE", onDutyMinutes: 0 };
    }
    return { status: "SCHEDULED_AWAITING", onDutyMinutes: 0 };
  }
  return { status: "OFF_DUTY", onDutyMinutes: 0 };
}

/**
 * Aggregates attendance metrics across a date range for payroll and timesheet reporting.
 * Strictly branch-scoped: unauthorized branches yield an empty summary.
 */
export async function getTimesheetSummary(
  scope: BranchScope,
  filters: TimesheetFilters,
): Promise<TimesheetSummaryData> {
  const emptySummary: TimesheetSummaryData = {
    startDate: filters.startDate,
    endDate: filters.endDate,
    totalEmployees: 0,
    totalScheduledMinutes: 0,
    totalWorkedMinutes: 0,
    totalRegularMinutes: 0,
    totalOvertimeMinutes: 0,
    totalLateMinutes: 0,
    totalExceptions: 0,
    rows: [],
  };

  const where = timesheetWhere(scope, filters);
  if (where === null) return emptySummary;

  const start = filters.startDate <= filters.endDate ? filters.startDate : filters.endDate;
  const end = filters.startDate <= filters.endDate ? filters.endDate : filters.startDate;

  const days = await prisma.attendanceDay.findMany({
    where,
    select: {
      employeeId: true,
      branchId: true,
      workDate: true,
      status: true,
      scheduledMinutes: true,
      netWorkedMinutes: true,
      regularMinutes: true,
      overtimeMinutes: true,
      lateMinutes: true,
      earlyDepartureMinutes: true,
      actualIn: true,
      actualOut: true,
      flags: true,
    },
  });

  const employeeIds = new Set<string>(days.map((d) => d.employeeId));

  // If filtered to a specific branch, include active staff even if they had 0 worked days
  if (filters.branchId) {
    const branchStaff = await prisma.employeeBranchAssignment.findMany({
      where: {
        branchId: filters.branchId,
        employee: { status: "ACTIVE" },
      },
      select: { employeeId: true },
    });
    for (const bs of branchStaff) {
      employeeIds.add(bs.employeeId);
    }
  }

  if (employeeIds.size === 0) {
    return emptySummary;
  }

  const [employeeRows, branchRows] = await Promise.all([
    prisma.employee.findMany({
      where: { id: { in: [...employeeIds] } },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        branchAssignments: {
          select: { branchId: true, isPrimary: true },
        },
      },
    }),
    prisma.branch.findMany({
      where: scope.kind === "branches" ? { id: { in: scope.branchIds } } : {},
      select: { id: true, name: true },
    }),
  ]);

  const branchNameMap = new Map(branchRows.map((b) => [b.id, b.name]));
  const searchLower = filters.search?.trim().toLowerCase();

  const rows: EmployeeTimesheetRow[] = [];

  for (const emp of employeeRows) {
    const fullName = `${emp.firstName} ${emp.lastName}`.trim();
    const code = emp.employeeCode ?? "";

    if (searchLower) {
      if (!fullName.toLowerCase().includes(searchLower) && !code.toLowerCase().includes(searchLower)) {
        continue;
      }
    }

    const empDays = days.filter((d) => d.employeeId === emp.id);

    const primaryAssignment =
      emp.branchAssignments.find((ba) => ba.isPrimary) ?? emp.branchAssignments[0];
    const employeeBranchId =
      filters.branchId ?? primaryAssignment?.branchId ?? empDays[0]?.branchId ?? "";
    const employeeBranchName = branchNameMap.get(employeeBranchId) ?? "Unknown";

    const daysScheduled = empDays.filter((d) => d.scheduledMinutes > 0).length;
    const daysWorked = empDays.filter((d) => d.actualIn !== null).length;
    const scheduledMinutes = empDays.reduce((acc, d) => acc + d.scheduledMinutes, 0);
    const netWorkedMinutes = empDays.reduce((acc, d) => acc + d.netWorkedMinutes, 0);
    const regularMinutes = empDays.reduce((acc, d) => acc + d.regularMinutes, 0);
    const overtimeMinutes = empDays.reduce((acc, d) => acc + d.overtimeMinutes, 0);
    const lateCount = empDays.filter((d) => d.lateMinutes > 0).length;
    const lateMinutes = empDays.reduce((acc, d) => acc + d.lateMinutes, 0);
    const earlyDepartureMinutes = empDays.reduce((acc, d) => acc + d.earlyDepartureMinutes, 0);
    const exceptionsCount = empDays.filter((d) => d.status === "NEEDS_REVIEW").length;

    rows.push({
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      name: fullName,
      branchId: employeeBranchId,
      branchName: employeeBranchName,
      daysScheduled,
      daysWorked,
      scheduledMinutes,
      netWorkedMinutes,
      regularMinutes,
      overtimeMinutes,
      lateCount,
      lateMinutes,
      earlyDepartureMinutes,
      exceptionsCount,
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));

  return {
    startDate: start,
    endDate: end,
    totalEmployees: rows.length,
    totalScheduledMinutes: rows.reduce((acc, r) => acc + r.scheduledMinutes, 0),
    totalWorkedMinutes: rows.reduce((acc, r) => acc + r.netWorkedMinutes, 0),
    totalRegularMinutes: rows.reduce((acc, r) => acc + r.regularMinutes, 0),
    totalOvertimeMinutes: rows.reduce((acc, r) => acc + r.overtimeMinutes, 0),
    totalLateMinutes: rows.reduce((acc, r) => acc + r.lateMinutes, 0),
    totalExceptions: rows.reduce((acc, r) => acc + r.exceptionsCount, 0),
    rows,
  };
}

export type LiveFloorStaff = {
  employeeId: string;
  employeeCode: string | null;
  name: string;
  jobTitle: string | null;
  status: "ON_DUTY" | "SCHEDULED_AWAITING" | "SCHEDULED_LATE" | "COMPLETED" | "ABSENT" | "OFF_DUTY";
  shiftName: string | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  actualIn: Date | null;
  actualOut: Date | null;
  onDutyMinutes: number;
  lateMinutes: number;
  netWorkedMinutes: number;
  flags: string[];
};

export type LiveFloorData = {
  branchId: string;
  branchName: string;
  asOf: string;
  todayKey: string;
  counts: {
    totalStaff: number;
    onDuty: number;
    awaiting: number;
    late: number;
    completed: number;
    absent: number;
    offDuty: number;
  };
  staff: LiveFloorStaff[];
};

/**
 * Returns the real-time shift and floor state for a single branch for today's date.
 */
export async function getLiveFloorStatus(
  scope: BranchScope,
  branchId: string,
  asOfDate?: Date,
): Promise<LiveFloorData | null> {
  if (scope.kind === "branches" && !scope.branchIds.includes(branchId)) {
    return null;
  }
  if (scope.kind === "none") {
    return null;
  }

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, name: true, timezone: true },
  });
  if (!branch) return null;

  const now = asOfDate ?? new Date();
  const todayKey = dateKeyInZone(now, DISPLAY_TIMEZONE);
  const todayDate = new Date(`${todayKey}T00:00:00.000Z`);

  const [staff, todayDays, shifts] = await Promise.all([
    prisma.employee.findMany({
      where: {
        status: "ACTIVE",
        branchAssignments: { some: { branchId } },
      },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        jobTitle: true,
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    prisma.attendanceDay.findMany({
      where: {
        branchId,
        workDate: todayDate,
      },
      select: {
        id: true,
        employeeId: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        scheduledMinutes: true,
        actualIn: true,
        actualOut: true,
        netWorkedMinutes: true,
        lateMinutes: true,
        flags: true,
      },
    }),
    prisma.shift.findMany({
      where: {
        isActive: true,
        OR: [{ branchId }, { branchId: null }],
      },
      select: {
        id: true,
        name: true,
        startMinute: true,
        endMinute: true,
        unpaidBreakMinutes: true,
      },
    }),
  ]);

  const staffIds = staff.map((s) => s.id);

  const [assignments, exceptions] = await Promise.all([
    prisma.employeeShiftAssignment.findMany({
      where: {
        employeeId: { in: staffIds },
        validFrom: { lte: todayDate },
        OR: [{ validTo: null }, { validTo: { gte: todayDate } }],
      },
      select: {
        employeeId: true,
        shiftId: true,
        daysOfWeek: true,
        validFrom: true,
        validTo: true,
      },
    }),
    prisma.scheduleException.findMany({
      where: {
        employeeId: { in: staffIds },
        date: todayDate,
      },
      select: {
        employeeId: true,
        date: true,
        type: true,
        shiftId: true,
      },
    }),
  ]);

  const dayMap = new Map(todayDays.map((d) => [d.employeeId, d]));

  const staffList: LiveFloorStaff[] = [];

  for (const emp of staff) {
    const day = dayMap.get(emp.id);
    const empAssignments = assignments.filter((a) => a.employeeId === emp.id);
    const empExceptions = exceptions
      .filter((e) => e.employeeId === emp.id)
      .map((e) => ({
        dateKey: todayKey,
        type: e.type,
        shiftId: e.shiftId,
      }));

    const resolved = resolveScheduleForDate(todayKey, {
      timeZone: DISPLAY_TIMEZONE,
      shifts,
      assignments: empAssignments,
      exceptions: empExceptions,
    });

    const scheduledStart = day?.scheduledStart ?? resolved?.scheduledStart ?? null;
    const scheduledEnd = day?.scheduledEnd ?? resolved?.scheduledEnd ?? null;
    const shiftName = resolved?.shiftName ?? (day?.scheduledMinutes ? "Scheduled shift" : null);

    const actualIn = day?.actualIn ?? null;
    const actualOut = day?.actualOut ?? null;
    const lateMinutes = day?.lateMinutes ?? 0;
    const netWorkedMinutes = day?.netWorkedMinutes ?? 0;
    const flags = day?.flags ?? [];

    const { status, onDutyMinutes } = classifyLiveFloorStatus({
      now,
      actualIn,
      actualOut,
      scheduledStart,
      scheduledEnd,
    });

    staffList.push({
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      name: `${emp.firstName} ${emp.lastName}`.trim(),
      jobTitle: emp.jobTitle,
      status,
      shiftName,
      scheduledStart,
      scheduledEnd,
      actualIn,
      actualOut,
      onDutyMinutes,
      lateMinutes,
      netWorkedMinutes,
      flags,
    });
  }

  // Priority order: ON_DUTY, SCHEDULED_LATE, SCHEDULED_AWAITING, COMPLETED, ABSENT, OFF_DUTY
  const priorityOrder: Record<LiveFloorStaff["status"], number> = {
    ON_DUTY: 1,
    SCHEDULED_LATE: 2,
    SCHEDULED_AWAITING: 3,
    COMPLETED: 4,
    ABSENT: 5,
    OFF_DUTY: 6,
  };

  staffList.sort((a, b) => {
    const diff = priorityOrder[a.status] - priorityOrder[b.status];
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });

  const counts = {
    totalStaff: staffList.length,
    onDuty: staffList.filter((s) => s.status === "ON_DUTY").length,
    awaiting: staffList.filter((s) => s.status === "SCHEDULED_AWAITING").length,
    late: staffList.filter((s) => s.status === "SCHEDULED_LATE").length,
    completed: staffList.filter((s) => s.status === "COMPLETED").length,
    absent: staffList.filter((s) => s.status === "ABSENT").length,
    offDuty: staffList.filter((s) => s.status === "OFF_DUTY").length,
  };

  return {
    branchId,
    branchName: branch.name,
    asOf: now.toISOString(),
    todayKey,
    counts,
    staff: staffList,
  };
}

export type EmployeeAttendanceDayRow = {
  id: string;
  dateKey: string;
  branchId: string;
  branchName: string;
  status: "PENDING" | "SETTLED" | "NEEDS_REVIEW";
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  scheduledMinutes: number;
  actualIn: Date | null;
  actualOut: Date | null;
  netWorkedMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  payableOvertimeMinutes: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  lowestIdentityAssurance: string | null;
  flags: string[];
  settledAt: Date | null;
};

export type EmployeeAttendanceSummary = {
  totalRecordedDays: number;
  daysWorked: number;
  totalNetMinutes: number;
  totalRegularMinutes: number;
  totalOvertimeMinutes: number;
  totalPayableOvertimeMinutes: number;
  totalLateMinutes: number;
  lateDaysCount: number;
  exceptionDaysCount: number;
  onTimeRate: number;
};

export type EmployeeAttendanceHistoryData = {
  summary: EmployeeAttendanceSummary;
  days: EmployeeAttendanceDayRow[];
};

/**
 * Returns an employee's recent attendance days and aggregated metrics, strictly scoped by branch.
 */
export async function getEmployeeAttendanceHistory(
  scope: BranchScope,
  employeeId: string,
  limit = 60,
): Promise<EmployeeAttendanceHistoryData | null> {
  const scoped = scopeWhere(scope);
  if (scoped === null) return null;

  const whereClause: Prisma.AttendanceDayWhereInput = {
    AND: [
      scoped,
      { employeeId },
    ],
  };

  const days = await prisma.attendanceDay.findMany({
    where: whereClause,
    orderBy: { workDate: "desc" },
    take: limit,
    select: {
      id: true,
      branchId: true,
      workDate: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      scheduledMinutes: true,
      actualIn: true,
      actualOut: true,
      netWorkedMinutes: true,
      regularMinutes: true,
      overtimeMinutes: true,
      payableOvertimeMinutes: true,
      lateMinutes: true,
      earlyDepartureMinutes: true,
      lowestIdentityAssurance: true,
      flags: true,
      settledAt: true,
    },
  });

  const branchIds = [...new Set(days.map((d) => d.branchId))];
  const branches = await prisma.branch.findMany({
    where: { id: { in: branchIds } },
    select: { id: true, name: true },
  });
  const branchMap = new Map(branches.map((b) => [b.id, b.name]));

  const rows: EmployeeAttendanceDayRow[] = days.map((day) => ({
    id: day.id,
    dateKey: dateKeyInZone(day.workDate, DISPLAY_TIMEZONE),
    branchId: day.branchId,
    branchName: branchMap.get(day.branchId) ?? "Unknown Branch",
    status: day.status,
    scheduledStart: day.scheduledStart,
    scheduledEnd: day.scheduledEnd,
    scheduledMinutes: day.scheduledMinutes,
    actualIn: day.actualIn,
    actualOut: day.actualOut,
    netWorkedMinutes: day.netWorkedMinutes,
    regularMinutes: day.regularMinutes,
    overtimeMinutes: day.overtimeMinutes,
    payableOvertimeMinutes: day.payableOvertimeMinutes,
    lateMinutes: day.lateMinutes,
    earlyDepartureMinutes: day.earlyDepartureMinutes,
    lowestIdentityAssurance: day.lowestIdentityAssurance,
    flags: day.flags,
    settledAt: day.settledAt,
  }));

  const daysWorked = rows.filter((r) => r.actualIn !== null).length;
  const lateDaysCount = rows.filter((r) => r.lateMinutes > 0).length;
  const exceptionDaysCount = rows.filter(
    (r) => r.status === "NEEDS_REVIEW" || r.flags.length > 0,
  ).length;

  const onTimeRate =
    daysWorked > 0 ? Math.round(((daysWorked - lateDaysCount) / daysWorked) * 100) : 100;

  const summary: EmployeeAttendanceSummary = {
    totalRecordedDays: rows.length,
    daysWorked,
    totalNetMinutes: rows.reduce((acc, r) => acc + r.netWorkedMinutes, 0),
    totalRegularMinutes: rows.reduce((acc, r) => acc + r.regularMinutes, 0),
    totalOvertimeMinutes: rows.reduce((acc, r) => acc + r.overtimeMinutes, 0),
    totalPayableOvertimeMinutes: rows.reduce((acc, r) => acc + r.payableOvertimeMinutes, 0),
    totalLateMinutes: rows.reduce((acc, r) => acc + r.lateMinutes, 0),
    lateDaysCount,
    exceptionDaysCount,
    onTimeRate,
  };

  return { summary, days: rows };
}

