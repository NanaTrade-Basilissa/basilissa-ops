import "server-only";
import { DayStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { zonedMinutesToUtc } from "@/lib/platform/date";
import { PROVIDER_BASELINE } from "./assurance";
import { canonicalEvents } from "./events";
import { voidedEventIds } from "./corrections";
import { projectDay, type ProjectedDay, type ProjectionEvent } from "./projection";
import { resolvePolicy } from "./policy-repository";
import { anchorWorkDate, resolveScheduleForDate, type ScheduleInputs } from "./schedule";

/**
 * Turning the pure projection into a stored day.
 *
 * Everything decision-making lives in `projection.ts`; this file only gathers
 * inputs and writes the result. Keeping the split sharp is what lets the
 * arithmetic be tested exhaustively without a database.
 */

/** Bump when projection logic changes, so older days can be found and replayed. */
export const PROJECTION_VERSION = 1;

/** Loads the schedule inputs for one employee at one branch. */
export async function loadScheduleInputs(
  employeeId: string,
  branchId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<ScheduleInputs> {
  const [branch, assignments, exceptions, shifts] = await Promise.all([
    tx.branch.findUnique({ where: { id: branchId }, select: { timezone: true } }),
    tx.employeeShiftAssignment.findMany({
      where: { employeeId },
      select: { shiftId: true, daysOfWeek: true, validFrom: true, validTo: true },
    }),
    tx.scheduleException.findMany({
      where: { employeeId },
      select: { date: true, type: true, shiftId: true },
    }),
    tx.shift.findMany({
      where: { OR: [{ branchId }, { branchId: null }] },
      select: { id: true, name: true, startMinute: true, endMinute: true, unpaidBreakMinutes: true },
    }),
  ]);

  return {
    timeZone: branch?.timezone ?? "Africa/Accra",
    shifts,
    assignments,
    exceptions: exceptions.map((entry) => ({
      // Stored as a DATE, so the UTC calendar day is the local one by
      // construction — no conversion, which would shift it.
      dateKey: entry.date.toISOString().slice(0, 10),
      type: entry.type,
      shiftId: entry.shiftId,
    })),
  };
}

/** Which work date an event belongs to, resolved against the schedule. */
export async function resolveWorkDate(
  employeeId: string,
  branchId: string,
  occurredAt: Date,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<string> {
  const inputs = await loadScheduleInputs(employeeId, branchId, tx);
  return anchorWorkDate(occurredAt, inputs).workDateKey;
}

/**
 * Recomputes and stores one employee's day.
 *
 * Idempotent by construction: it derives everything from the events, so running
 * it twice produces the same row. That is what makes replaying the log after a
 * bug fix safe.
 */
export async function settleDay(
  employeeId: string,
  branchId: string,
  workDateKey: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
  asOf: Date = new Date(),
): Promise<ProjectedDay> {
  const inputs = await loadScheduleInputs(employeeId, branchId, tx);
  const schedule = resolveScheduleForDate(workDateKey, inputs);

  // Policy is resolved AT THE WORK DATE, not now. Using today's rules to
  // recompute an old day is exactly the silent rewrite effective dating exists
  // to prevent.
  const policy = await resolvePolicy(
    branchId,
    schedule?.scheduledStart ?? zonedMinutesToUtc(workDateKey, 0, inputs.timeZone),
  );

  // A generous window either side, because an overnight shift's events sit on
  // two calendar dates and anchoring decides which day owns them.
  const dayStart = zonedMinutesToUtc(workDateKey, 0, inputs.timeZone);
  const windowStart = new Date(dayStart.getTime() - 24 * 60 * 60_000);
  const windowEnd = new Date(dayStart.getTime() + 48 * 60 * 60_000);

  const rows = await tx.attendanceEvent.findMany({
    where: { employeeId, occurredAt: { gte: windowStart, lte: windowEnd } },
    select: {
      id: true,
      direction: true,
      occurredAt: true,
      providerType: true,
      identityAssurance: true,
      locationAssurance: true,
      timeAssurance: true,
      supersedesEventId: true,
      supersededByEventId: true,
    },
  });

  // Only the events this work date actually owns. A punch at 01:00 may belong
  // to the previous night, and including it here would double-count it.
  const owned = rows.filter(
    (row) => anchorWorkDate(row.occurredAt, inputs).workDateKey === workDateKey,
  );

  // Corrections do not delete anything; they stop events counting. The rows
  // stay readable so the day's history shows both what was recorded and what
  // was decided.
  const corrections = await tx.attendanceCorrection.findMany({
    where: { employeeId, workDate: new Date(`${workDateKey}T00:00:00.000Z`) },
    select: { operation: true, targetEventId: true },
  });
  const voided = voidedEventIds(corrections);

  const events: ProjectionEvent[] = canonicalEvents(owned, voided).map((row) => ({
    id: row.id,
    direction: row.direction,
    occurredAt: row.occurredAt,
    providerType: row.providerType,
    assurance: {
      identity: row.identityAssurance,
      location: row.locationAssurance,
      time: row.timeAssurance,
    },
  }));

  const projected = projectDay({
    workDateKey,
    events,
    schedule,
    policy,
    asOf,
    correctionCount: corrections.length,
  });

  const workDate = new Date(`${workDateKey}T00:00:00.000Z`);
  const data = {
    branchId,
    status: projected.status,
    shiftIdSnapshot: projected.shiftId,
    scheduledStart: projected.scheduledStart,
    scheduledEnd: projected.scheduledEnd,
    scheduledMinutes: projected.scheduledMinutes,
    actualIn: projected.actualIn,
    actualOut: projected.actualOut,
    breakMinutes: projected.breakMinutes,
    grossMinutes: projected.grossMinutes,
    netWorkedMinutes: projected.netWorkedMinutes,
    regularMinutes: projected.regularMinutes,
    overtimeMinutes: projected.overtimeMinutes,
    lateMinutes: projected.lateMinutes,
    earlyDepartureMinutes: projected.earlyDepartureMinutes,
    lowestIdentityAssurance: projected.lowestAssurance?.identity ?? null,
    lowestLocationAssurance: projected.lowestAssurance?.location ?? null,
    lowestTimeAssurance: projected.lowestAssurance?.time ?? null,
    flags: projected.flags,
    policySnapshot: projected.policySnapshot as unknown as Prisma.InputJsonValue,
    settledAt: projected.status === "SETTLED" ? asOf : null,
    projectionVersion: PROJECTION_VERSION,
  };

  await tx.attendanceDay.upsert({
    where: { employeeId_workDate: { employeeId, workDate } },
    // payableOvertimeMinutes is deliberately absent from the update: it is set
    // by approval, and recomputing a day must not silently un-approve overtime
    // somebody already authorised.
    create: { employeeId, workDate, ...data },
    update: data,
  });

  return projected;
}

export type SettlementSweepSummary = {
  examined: number;
  settled: number;
};

/**
 * Sweeps unclosed or open attendance records from previous days (or shifts that
 * ended at least 2 hours ago) and projects/settles them into final day totals.
 */
export async function runDailySettlementSweep(
  now: Date = new Date(),
  limit = 200,
  settleFn = settleDay,
): Promise<SettlementSweepSummary> {
  const todayKey = now.toISOString().slice(0, 10);
  const todayDate = new Date(`${todayKey}T00:00:00.000Z`);

  const openDays = await prisma.attendanceDay.findMany({
    where: {
      status: DayStatus.PENDING,
      OR: [
        { workDate: { lt: todayDate } },
        { scheduledEnd: { not: null, lt: new Date(now.getTime() - 2 * 60 * 60 * 1000) } },
      ],
    },
    select: {
      employeeId: true,
      branchId: true,
      workDate: true,
    },
    take: limit,
  });

  let settled = 0;
  for (const day of openDays) {
    const workDateKey = day.workDate.toISOString().slice(0, 10);
    try {
      const result = await settleFn(day.employeeId, day.branchId, workDateKey, prisma, now);
      if (result.status === "SETTLED") {
        settled++;
      }
    } catch {
      // Continue next day if one fails
    }
  }

  return { examined: openDays.length, settled };
}

/** Baseline assurance for a provider, before per-event evidence adjusts it. */
export { PROVIDER_BASELINE };
