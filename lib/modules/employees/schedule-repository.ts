"use server";

import { prisma } from "@/lib/platform/prisma";
import type { BranchScope } from "@/lib/modules/identity/authorization";
import { shiftDateKey } from "@/lib/platform/date";
import {
  resolveScheduleForDate,
  type ShiftTemplate,
  type ScheduleInputs,
} from "@/lib/modules/attendance/schedule";
import { loadLivePatterns } from "@/lib/modules/attendance/server";
import { ScheduleExceptionType } from "@prisma/client";

export type DayColumn = {
  dateKey: string;
  dayName: string;
  formattedDay: string;
  isoWeekday: number;
  /** Set when the day is a public holiday. */
  holidayName: string | null;
};

export type EmployeeDaySchedule = {
  dateKey: string;
  shiftId: string | null;
  shiftName: string | null;
  startMinute: number | null;
  endMinute: number | null;
  isException: boolean;
  exceptionId?: string;
  exceptionType?: ScheduleExceptionType;
  exceptionReason?: string;
  /**
   * A cover shift away from the row's home branch, or, on a visitor's row, the
   * branch this grid is for. Null for an ordinary day.
   */
  coverBranchName?: string | null;
  /** True on a home-staff row when the person is covering elsewhere that day. */
  isAway?: boolean;
};

export type EmployeeScheduleRow = {
  employeeId: string;
  name: string;
  employeeCode: string | null;
  jobTitle: string | null;
  days: Record<string, EmployeeDaySchedule>;
  /** Someone from another branch with a cover shift here this week. */
  isVisitor: boolean;
  homeBranchName: string | null;
  /** The rota pattern this person is on at this branch during the week. */
  patternName: string | null;
};

export type DailyCoverage = {
  dateKey: string;
  totalScheduled: number;
  totalDayOff: number;
  shiftCounts: Record<string, number>; // shiftId -> count
};

export type WeeklyScheduleData = {
  branchId: string;
  branchName: string;
  /** Patterns drive the schedule live; when false, weeks are generated. */
  autoRota: boolean;
  weekStartKey: string;
  days: DayColumn[];
  shifts: {
    id: string;
    name: string;
    startMinute: number;
    endMinute: number;
  }[];
  employees: EmployeeScheduleRow[];
  coverage: Record<string, DailyCoverage>;
};

/**
 * Loads the weekly rota and staff schedule for one branch from Monday to Sunday.
 */
export async function getWeeklyBranchSchedule(
  scope: BranchScope,
  branchId: string,
  weekStartKey: string,
): Promise<WeeklyScheduleData | null> {
  // Authorization: scope enforcement
  if (scope.kind === "branches" && !scope.branchIds.includes(branchId)) {
    return null;
  }
  if (scope.kind === "none") {
    return null;
  }

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, name: true, timezone: true, autoRota: true },
  });
  if (!branch) return null;

  const timeZone = branch.timezone || "Africa/Accra";

  // Build the 7 days: Monday to Sunday
  const days: DayColumn[] = [0, 1, 2, 3, 4, 5, 6].map((offset) => {
    const dateKey = shiftDateKey(weekStartKey, offset);
    const [year, month, day] = dateKey.split("-").map(Number);
    const dateObj = new Date(Date.UTC(year!, month! - 1, day!));
    const dayName = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(dateObj);
    const formattedDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(dateObj);
    const isoWeekday = offset + 1; // 1 = Mon ... 7 = Sun
    return { dateKey, dayName, formattedDay, isoWeekday, holidayName: null as string | null };
  });

  const weekStartDate = new Date(`${days[0].dateKey}T00:00:00.000Z`);
  const weekEndDate = new Date(`${days[6].dateKey}T23:59:59.999Z`);

  const holidayRows = await prisma.publicHoliday.findMany({ select: { date: true, name: true } });
  const holidays = new Set(holidayRows.map((h) => h.date.toISOString().slice(0, 10)));
  for (const h of holidayRows) {
    const day = days.find((d) => d.dateKey === h.date.toISOString().slice(0, 10));
    if (day) day.holidayName = h.name;
  }

  const employeeSelect = {
    id: true,
    firstName: true,
    lastName: true,
    employeeCode: true,
    jobTitle: true,
  } as const;

  // Active employees assigned to this branch
  const branchAssignments = await prisma.employeeBranchAssignment.findMany({
    where: {
      branchId,
      validTo: null,
      employee: { status: "ACTIVE" },
    },
    include: { employee: { select: employeeSelect } },
    orderBy: [
      { employee: { lastName: "asc" } },
      { employee: { firstName: "asc" } },
    ],
  });

  const homeIds = new Set(branchAssignments.map((ba) => ba.employee.id));

  // People from elsewhere with a cover shift at this branch this week. They
  // appear on this grid for the week, with only their cover days filled in.
  const visitorCovers = await prisma.scheduleException.findMany({
    where: {
      branchId,
      date: { gte: weekStartDate, lte: weekEndDate },
      employeeId: { notIn: [...homeIds] },
    },
    select: { employeeId: true },
  });
  const visitorRows = await prisma.employee.findMany({
    where: { id: { in: [...new Set(visitorCovers.map((v) => v.employeeId))] }, status: "ACTIVE" },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      ...employeeSelect,
      branchAssignments: {
        where: { validTo: null },
        orderBy: { isPrimary: "desc" },
        take: 1,
        select: { branch: { select: { name: true } } },
      },
    },
  });
  const visitors = new Map(visitorRows.map((v) => [v.id, v]));

  const employeeIds = [...homeIds, ...visitors.keys()];
  const livePatterns = await loadLivePatterns(employeeIds);

  // Which pattern each person is on here this week, for the row label.
  const weekPatternRows = await prisma.employeePatternAssignment.findMany({
    where: {
      branchId,
      employeeId: { in: [...homeIds] },
      validFrom: { lte: new Date(`${shiftDateKey(weekStartKey, 6)}T23:59:59.999Z`) },
      OR: [{ validTo: null }, { validTo: { gt: new Date(`${weekStartKey}T00:00:00.000Z`) } }],
    },
    orderBy: { validFrom: "asc" },
    select: { employeeId: true, pattern: { select: { name: true } } },
  });
  const patternNames = new Map(weekPatternRows.map((row) => [row.employeeId, row.pattern.name]));

  // Available shifts for this branch (branch-specific + global)
  const shifts = await prisma.shift.findMany({
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
      offOnPublicHolidays: true,
    },
    orderBy: { startMinute: "asc" },
  });

  const shiftTemplates: ShiftTemplate[] = shifts;

  // Recurring shift assignments for these employees
  const shiftAssignments = await prisma.employeeShiftAssignment.findMany({
    where: {
      employeeId: { in: employeeIds },
      validFrom: { lte: weekEndDate },
      OR: [{ validTo: null }, { validTo: { gte: weekStartDate } }],
    },
    select: {
      employeeId: true,
      shiftId: true,
      daysOfWeek: true,
      validFrom: true,
      validTo: true,
    },
  });

  // Schedule exceptions for these employees in this week
  const exceptions = await prisma.scheduleException.findMany({
    where: {
      employeeId: { in: employeeIds },
      date: { gte: weekStartDate, lte: weekEndDate },
    },
    include: { shift: true, branch: { select: { name: true } } },
  });

  // Coverage tracker per dateKey
  const coverage: Record<string, DailyCoverage> = {};
  for (const d of days) {
    coverage[d.dateKey] = {
      dateKey: d.dateKey,
      totalScheduled: 0,
      totalDayOff: 0,
      shiftCounts: {},
    };
    for (const s of shifts) {
      coverage[d.dateKey].shiftCounts[s.id] = 0;
    }
  }

  const rowFor = (
    emp: { id: string; firstName: string; lastName: string; employeeCode: string; jobTitle: string | null },
    isVisitor: boolean,
    homeBranchName: string | null,
  ): EmployeeScheduleRow => {
    const empAssignments = shiftAssignments.filter((sa) => sa.employeeId === emp.id);
    const empExceptions = exceptions.filter((ex) => ex.employeeId === emp.id);

    const scheduleInputs: ScheduleInputs = {
      timeZone,
      shifts: shiftTemplates,
      assignments: empAssignments,
      exceptions: empExceptions.map((ex) => ({
        dateKey: ex.date.toISOString().slice(0, 10),
        type: ex.type,
        shiftId: ex.shiftId,
        branchId: ex.branchId,
      })),
      holidays,
      patterns: livePatterns.get(emp.id) ?? [],
    };

    const daySchedules: Record<string, EmployeeDaySchedule> = {};
    const empty = (dateKey: string): EmployeeDaySchedule => ({
      dateKey,
      shiftId: null,
      shiftName: null,
      startMinute: null,
      endMinute: null,
      isException: false,
    });

    for (const d of days) {
      const ex = empExceptions.find((e) => e.date.toISOString().slice(0, 10) === d.dateKey);
      const coverHere = ex?.branchId === branchId;
      const coverElsewhere = Boolean(ex?.branchId) && !coverHere;

      // A visitor's other days belong to their own branch's grid.
      if (isVisitor && !coverHere) {
        daySchedules[d.dateKey] = empty(d.dateKey);
        continue;
      }

      const resolved = resolveScheduleForDate(d.dateKey, scheduleInputs);

      if (resolved) {
        daySchedules[d.dateKey] = {
          dateKey: d.dateKey,
          shiftId: resolved.shiftId,
          shiftName: resolved.shiftName,
          startMinute: shifts.find((s) => s.id === resolved.shiftId)?.startMinute ?? null,
          endMinute: shifts.find((s) => s.id === resolved.shiftId)?.endMinute ?? null,
          isException: resolved.source === "exception",
          exceptionId: ex?.id,
          exceptionType: ex?.type,
          exceptionReason: ex?.reason,
          coverBranchName: ex?.branchId ? (ex.branch?.name ?? null) : null,
          isAway: coverElsewhere,
        };

        // Someone covering elsewhere is not on this branch's floor that day.
        if (!coverElsewhere) {
          coverage[d.dateKey].totalScheduled += 1;
          coverage[d.dateKey].shiftCounts[resolved.shiftId] =
            (coverage[d.dateKey].shiftCounts[resolved.shiftId] || 0) + 1;
        }
      } else if (ex?.type === ScheduleExceptionType.DAY_OFF) {
        daySchedules[d.dateKey] = {
          ...empty(d.dateKey),
          isException: true,
          exceptionId: ex.id,
          exceptionType: ScheduleExceptionType.DAY_OFF,
          exceptionReason: ex.reason,
        };
        coverage[d.dateKey].totalDayOff += 1;
      } else {
        daySchedules[d.dateKey] = empty(d.dateKey);
      }
    }

    return {
      employeeId: emp.id,
      name: `${emp.firstName} ${emp.lastName}`.trim(),
      employeeCode: emp.employeeCode,
      jobTitle: emp.jobTitle,
      days: daySchedules,
      isVisitor,
      homeBranchName,
      patternName: isVisitor ? null : (patternNames.get(emp.id) ?? null),
    };
  };

  const employees: EmployeeScheduleRow[] = [
    ...branchAssignments.map((ba) => rowFor(ba.employee, false, null)),
    ...[...visitors.values()].map((v) => rowFor(v, true, v.branchAssignments[0]?.branch.name ?? null)),
  ];

  return {
    branchId: branch.id,
    branchName: branch.name,
    autoRota: branch.autoRota,
    weekStartKey,
    days,
    shifts,
    employees,
    coverage,
  };
}
