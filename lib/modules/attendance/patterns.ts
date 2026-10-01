import "server-only";
import { ScheduleExceptionType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { recordAudit, type AuditActor } from "@/lib/platform/audit";
import { shiftDateKey, zonedMinutesToUtc } from "@/lib/platform/date";
import { patternDayFor, type PatternLike } from "./schedule";
import { settleDay } from "./settle";

/**
 * Rota patterns: storage, assignment, and the two ways a pattern reaches a
 * schedule. With the branch's Auto rota on, `loadLivePatterns` feeds them to
 * resolution directly. With it off, `generatePatternWeek` writes a week into
 * one-day overrides for the manager to adjust.
 */

type Reader = typeof prisma | Prisma.TransactionClient;

const toDate = (dateKey: string) => new Date(`${dateKey}T00:00:00.000Z`);
const toKey = (date: Date) => date.toISOString().slice(0, 10);

const ASSIGNMENT_SELECT = {
  employeeId: true,
  anchorDate: true,
  validFrom: true,
  validTo: true,
  pattern: { select: { days: { select: { dayIndex: true, shiftId: true }, orderBy: { dayIndex: "asc" } } } },
} as const;

type AssignmentRow = {
  employeeId: string;
  anchorDate: Date;
  validFrom: Date;
  validTo: Date | null;
  pattern: { days: { dayIndex: number; shiftId: string | null }[] };
};

function toPatternLike(row: AssignmentRow): PatternLike {
  return {
    anchorDateKey: toKey(row.anchorDate),
    cycle: row.pattern.days.map((day) => day.shiftId),
    validFrom: row.validFrom,
    validTo: row.validTo,
  };
}

/**
 * The patterns that apply live, per employee: those on branches with Auto rota
 * on. A branch on manual rota is deliberately absent; its patterns reach the
 * schedule only through generated weeks.
 */
export async function loadLivePatterns(
  employeeIds: readonly string[],
  tx: Reader = prisma,
): Promise<Map<string, PatternLike[]>> {
  const result = new Map<string, PatternLike[]>();
  if (employeeIds.length === 0) return result;

  const rows = await tx.employeePatternAssignment.findMany({
    where: { employeeId: { in: [...employeeIds] }, branch: { autoRota: true } },
    select: ASSIGNMENT_SELECT,
  });
  for (const row of rows) {
    result.set(row.employeeId, [...(result.get(row.employeeId) ?? []), toPatternLike(row)]);
  }
  return result;
}

/** One employee's live patterns. */
export async function loadLivePatternsFor(employeeId: string, tx: Reader = prisma): Promise<PatternLike[]> {
  return (await loadLivePatterns([employeeId], tx)).get(employeeId) ?? [];
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

export type PatternInput = {
  name: string;
  branchId: string | null;
  /** One entry per day of the cycle: a shift id, or null for a day off. */
  cycle: (string | null)[];
};

export type PatternSummary = {
  id: string;
  name: string;
  branchId: string | null;
  branchName: string | null;
  isActive: boolean;
  cycle: { shiftId: string | null; shiftName: string | null; startMinute: number | null; endMinute: number | null }[];
  /** People on it now. */
  activeAssignments: number;
};

export async function listPatterns(branchIds: string[] | "all"): Promise<PatternSummary[]> {
  const now = new Date();
  const rows = await prisma.shiftPattern.findMany({
    where: branchIds === "all" ? {} : { OR: [{ branchId: null }, { branchId: { in: branchIds } }] },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      branch: { select: { name: true } },
      days: {
        orderBy: { dayIndex: "asc" },
        include: { shift: { select: { name: true, startMinute: true, endMinute: true } } },
      },
      _count: { select: { assignments: { where: { OR: [{ validTo: null }, { validTo: { gt: now } }] } } } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    isActive: row.isActive,
    cycle: row.days.map((day) => ({
      shiftId: day.shiftId,
      shiftName: day.shift?.name ?? null,
      startMinute: day.shift?.startMinute ?? null,
      endMinute: day.shift?.endMinute ?? null,
    })),
    activeAssignments: row._count.assignments,
  }));
}

export class PatternInUseError extends Error {
  constructor(count: number) {
    super(`${count} ${count === 1 ? "person is" : "people are"} on this pattern. End their pattern first, or deactivate it.`);
  }
}

/** Creates (id null) or replaces a pattern's name, branch and cycle. */
export async function savePattern(
  id: string | null,
  input: PatternInput,
  actor: AuditActor,
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const days = input.cycle.map((shiftId, dayIndex) => ({ dayIndex, shiftId }));

    if (id) {
      const before = await tx.shiftPattern.findUniqueOrThrow({
        where: { id },
        include: { days: { orderBy: { dayIndex: "asc" } } },
      });
      await tx.shiftPatternDay.deleteMany({ where: { patternId: id } });
      await tx.shiftPattern.update({
        where: { id },
        data: { name: input.name, branchId: input.branchId, days: { create: days } },
      });
      await recordAudit(
        {
          actor,
          action: "pattern.updated",
          entityType: "ShiftPattern",
          entityId: id,
          before: { name: before.name, branchId: before.branchId, cycle: before.days.map((d) => d.shiftId) },
          after: input,
        },
        tx,
      );
      return { id };
    }

    const created = await tx.shiftPattern.create({
      data: { name: input.name, branchId: input.branchId, createdBy: actor.userId, days: { create: days } },
    });
    await recordAudit(
      { actor, action: "pattern.created", entityType: "ShiftPattern", entityId: created.id, after: input },
      tx,
    );
    return { id: created.id };
  });
}

export async function setPatternActive(id: string, isActive: boolean, actor: AuditActor): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.shiftPattern.update({ where: { id }, data: { isActive } });
    await recordAudit(
      {
        actor,
        action: isActive ? "pattern.activated" : "pattern.deactivated",
        entityType: "ShiftPattern",
        entityId: id,
      },
      tx,
    );
  });
}

/** Deletes a pattern nobody has ever been on; history keeps any that were used. */
export async function deletePattern(id: string, actor: AuditActor): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const uses = await tx.employeePatternAssignment.count({ where: { patternId: id } });
    if (uses > 0) throw new PatternInUseError(uses);
    const before = await tx.shiftPattern.delete({ where: { id } });
    await recordAudit(
      { actor, action: "pattern.deleted", entityType: "ShiftPattern", entityId: id, before: { name: before.name } },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

export type AssignPatternInput = {
  branchId: string;
  /** Null ends the person's pattern at this branch from `startDateKey`. */
  patternId: string | null;
  employeeIds: string[];
  startDateKey: string;
  /** Days each successive person starts later in the cycle, to stagger days off. */
  staggerDays: number;
  timeZone: string;
};

/**
 * Puts people on a pattern from a date, closing whatever pattern they were on
 * at this branch. Person i starts `i * staggerDays` days into the cycle, so a
 * team on one pattern does not all take the same day off.
 */
export async function assignPattern(input: AssignPatternInput, actor: AuditActor): Promise<{ assigned: number }> {
  const validFrom = zonedMinutesToUtc(input.startDateKey, 0, input.timeZone);

  return prisma.$transaction(async (tx) => {
    let assigned = 0;
    for (const [index, employeeId] of input.employeeIds.entries()) {
      // Close what is open here. Effective-dated, so the past keeps its rota.
      await tx.employeePatternAssignment.updateMany({
        where: {
          employeeId,
          branchId: input.branchId,
          OR: [{ validTo: null }, { validTo: { gt: validFrom } }],
          validFrom: { lt: validFrom },
        },
        data: { validTo: validFrom },
      });
      // Anything that would have started on or after this date is superseded.
      await tx.employeePatternAssignment.deleteMany({
        where: { employeeId, branchId: input.branchId, validFrom: { gte: validFrom } },
      });

      if (input.patternId) {
        // Starting k days into the cycle on the start date means day 0 fell k
        // days earlier.
        const anchorDateKey = shiftDateKey(input.startDateKey, -index * input.staggerDays);
        await tx.employeePatternAssignment.create({
          data: {
            employeeId,
            patternId: input.patternId,
            branchId: input.branchId,
            anchorDate: toDate(anchorDateKey),
            validFrom,
            createdBy: actor.userId,
          },
        });
        assigned += 1;
      }

      await recordAudit(
        {
          actor,
          action: input.patternId ? "pattern.assigned" : "pattern.ended",
          entityType: "Employee",
          entityId: employeeId,
          after: {
            patternId: input.patternId,
            branchId: input.branchId,
            from: input.startDateKey,
            startsOnCycleDay: input.patternId ? index * input.staggerDays : null,
          },
        },
        tx,
      );
    }
    return { assigned };
  });
}

// ---------------------------------------------------------------------------
// Auto rota and generating weeks
// ---------------------------------------------------------------------------

export async function setAutoRota(branchId: string, autoRota: boolean, actor: AuditActor): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const before = await tx.branch.findUniqueOrThrow({ where: { id: branchId }, select: { autoRota: true } });
    await tx.branch.update({ where: { id: branchId }, data: { autoRota } });
    await recordAudit(
      {
        actor,
        action: "branch.auto_rota_changed",
        entityType: "Branch",
        entityId: branchId,
        before: { autoRota: before.autoRota },
        after: { autoRota },
      },
      tx,
    );
  });
}

export type GenerateResult = { written: number; skipped: number; people: number };

/**
 * Writes one week of a manual-rota branch's patterns into one-day overrides:
 * a shift for a working day, a day off for an off day. Days that already have
 * an override (a manager's edit, approved leave, a cover shift) are kept unless
 * `overwrite`, so generating again never undoes someone's change by accident.
 */
export async function generatePatternWeek(
  branchId: string,
  weekStartKey: string,
  overwrite: boolean,
  actor: AuditActor,
): Promise<GenerateResult> {
  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: branchId }, select: { timezone: true } });
  const dateKeys = [0, 1, 2, 3, 4, 5, 6].map((offset) => shiftDateKey(weekStartKey, offset));
  const weekStart = zonedMinutesToUtc(dateKeys[0]!, 0, branch.timezone);
  const weekEnd = zonedMinutesToUtc(shiftDateKey(dateKeys[6]!, 1), 0, branch.timezone);

  const rows = await prisma.employeePatternAssignment.findMany({
    where: {
      branchId,
      validFrom: { lt: weekEnd },
      OR: [{ validTo: null }, { validTo: { gt: weekStart } }],
    },
    select: ASSIGNMENT_SELECT,
  });
  const active = new Set(
    (
      await prisma.employee.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.employeeId))] }, status: "ACTIVE" },
        select: { id: true },
      })
    ).map((e) => e.id),
  );
  const people = rows.filter((row) => active.has(row.employeeId));

  let written = 0;
  let skipped = 0;
  const reason = `Generated from rota pattern, week of ${weekStartKey}`;

  await prisma.$transaction(
    async (tx) => {
      for (const row of people) {
        const pattern = toPatternLike(row);
        for (const dateKey of dateKeys) {
          const dayStart = zonedMinutesToUtc(dateKey, 0, branch.timezone);
          const inEffect =
            pattern.validFrom.getTime() <= dayStart.getTime() &&
            (pattern.validTo === null || pattern.validTo.getTime() > dayStart.getTime());
          if (!inEffect) continue;

          const date = toDate(dateKey);
          const existing = await tx.scheduleException.findUnique({
            where: { employeeId_date: { employeeId: row.employeeId, date } },
          });
          if (existing && !overwrite) {
            skipped += 1;
            continue;
          }

          const shiftId = patternDayFor(dateKey, pattern);
          const data = shiftId
            ? { type: ScheduleExceptionType.SHIFT_CHANGE, shiftId, branchId: null, reason }
            : { type: ScheduleExceptionType.DAY_OFF, shiftId: null, branchId: null, reason };
          await tx.scheduleException.upsert({
            where: { employeeId_date: { employeeId: row.employeeId, date } },
            create: { employeeId: row.employeeId, date, createdBy: actor.userId, ...data },
            update: data,
          });

          const recorded = await tx.attendanceDay.findUnique({
            where: { employeeId_workDate: { employeeId: row.employeeId, workDate: date } },
            select: { branchId: true },
          });
          if (recorded) await settleDay(row.employeeId, recorded.branchId, dateKey, tx);
          written += 1;
        }
      }

      await recordAudit(
        {
          actor,
          action: "schedule.week_generated",
          entityType: "BranchSchedule",
          entityId: branchId,
          metadata: { weekStartKey, overwrite, written, skipped, people: people.length },
        },
        tx,
      );
    },
    { timeout: 60_000 },
  );

  return { written, skipped, people: new Set(people.map((r) => r.employeeId)).size };
}
