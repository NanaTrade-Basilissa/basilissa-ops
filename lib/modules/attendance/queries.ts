import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import type { BranchScope } from "@/lib/modules/identity/authorization";

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
