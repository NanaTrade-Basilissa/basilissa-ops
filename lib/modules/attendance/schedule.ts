import { ScheduleExceptionType } from "@prisma/client";
import { dateKeyInZone, isoWeekdayInZone, shiftDateKey, zonedMinutesToUtc } from "@/lib/platform/date";

/**
 * Schedule resolution and work-date anchoring. Pure — no Prisma, no I/O.
 *
 * The hard part is not "which shift", it is "which day does this punch belong
 * to". For a 22:00–06:00 shift, a clock-out at 01:00 on Wednesday belongs to
 * Tuesday's shift. Anchoring it to Wednesday would split one night across two
 * days, and each half would look like a missing punch.
 */

export type ShiftTemplate = {
  id: string;
  name: string;
  /** Minutes from local midnight, 0-1439. */
  startMinute: number;
  endMinute: number;
  unpaidBreakMinutes: number;
};

export type AssignmentLike = {
  shiftId: string;
  /** ISO weekdays: 1 = Monday … 7 = Sunday. */
  daysOfWeek: number[];
  validFrom: Date;
  validTo: Date | null;
};

export type ExceptionLike = {
  /** Local calendar date, "YYYY-MM-DD". */
  dateKey: string;
  type: ScheduleExceptionType;
  shiftId: string | null;
};

export type ScheduleInputs = {
  timeZone: string;
  shifts: readonly ShiftTemplate[];
  assignments: readonly AssignmentLike[];
  exceptions: readonly ExceptionLike[];
};

export type ResolvedSchedule = {
  /** Local calendar date the shift is anchored to. */
  workDateKey: string;
  shiftId: string;
  shiftName: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  unpaidBreakMinutes: number;
  /** True when the shift runs past local midnight. */
  crossesMidnight: boolean;
  source: "exception" | "assignment";
};

/** A shift whose end is at or before its start runs into the next day. */
export function crossesMidnight(shift: ShiftTemplate): boolean {
  return shift.endMinute <= shift.startMinute;
}

/** Scheduled length in minutes, correct across midnight. */
export function scheduledMinutes(shift: ShiftTemplate): number {
  const raw = shift.endMinute - shift.startMinute;
  return raw > 0 ? raw : raw + 24 * 60;
}

function findShift(shifts: readonly ShiftTemplate[], shiftId: string | null): ShiftTemplate | undefined {
  return shiftId ? shifts.find((shift) => shift.id === shiftId) : undefined;
}

function isAssignmentInEffect(assignment: AssignmentLike, dayStart: Date): boolean {
  if (assignment.validFrom.getTime() > dayStart.getTime()) return false;
  return assignment.validTo === null || assignment.validTo.getTime() > dayStart.getTime();
}

function build(
  shift: ShiftTemplate,
  workDateKey: string,
  timeZone: string,
  source: ResolvedSchedule["source"],
): ResolvedSchedule {
  const spansMidnight = crossesMidnight(shift);

  return {
    workDateKey,
    shiftId: shift.id,
    shiftName: shift.name,
    scheduledStart: zonedMinutesToUtc(workDateKey, shift.startMinute, timeZone),
    // An overnight shift ends on the following calendar date. The work date
    // stays the day it started, which is what keeps the night together.
    scheduledEnd: zonedMinutesToUtc(
      spansMidnight ? shiftDateKey(workDateKey, 1) : workDateKey,
      shift.endMinute,
      timeZone,
    ),
    unpaidBreakMinutes: shift.unpaidBreakMinutes,
    crossesMidnight: spansMidnight,
    source,
  };
}

/**
 * The schedule for one employee on one local work date, or null if they were
 * not scheduled.
 *
 * Order, most specific first:
 *   1. an exception for that date  (DAY_OFF wins outright)
 *   2. an effective assignment covering that weekday
 *   3. nothing — attendance is still recorded, but flagged UNSCHEDULED and no
 *      lateness or overtime is computed, because there is nothing to compare to
 */
export function resolveScheduleForDate(
  workDateKey: string,
  inputs: ScheduleInputs,
): ResolvedSchedule | null {
  const { timeZone, shifts, assignments, exceptions } = inputs;
  const dayStart = zonedMinutesToUtc(workDateKey, 0, timeZone);

  const exception = exceptions.find((entry) => entry.dateKey === workDateKey);
  if (exception) {
    if (exception.type === ScheduleExceptionType.DAY_OFF) return null;

    const shift = findShift(shifts, exception.shiftId);
    // A SHIFT_CHANGE or EXTRA_SHIFT naming a shift that no longer exists is
    // bad data, not a day off. Fall through so the assignment still applies
    // rather than silently unscheduling someone who is at work.
    if (shift) return build(shift, workDateKey, timeZone, "exception");
  }

  const weekday = isoWeekdayInZone(dayStart, timeZone);
  const assignment = assignments
    .filter((entry) => isAssignmentInEffect(entry, dayStart) && entry.daysOfWeek.includes(weekday))
    // Most recently effective wins, so overlapping assignments are deterministic.
    .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime())[0];

  if (!assignment) return null;

  const shift = findShift(shifts, assignment.shiftId);
  return shift ? build(shift, workDateKey, timeZone, "assignment") : null;
}

/**
 * How far outside its scheduled window a punch may fall and still belong to
 * that shift.
 *
 * Asymmetric on purpose. Arriving early is bounded in practice — nobody turns
 * up five hours before a shift — whereas leaving late is overtime and can run
 * long, which is exactly the case that must still anchor correctly. A
 * symmetric window generous enough for overtime would also reach backwards far
 * enough to pull a punch onto a shift it plainly does not belong to.
 */
export const ANCHOR_BEFORE_START_MINUTES = 4 * 60;
export const ANCHOR_AFTER_END_MINUTES = 8 * 60;

export type AnchorResult = {
  workDateKey: string;
  schedule: ResolvedSchedule | null;
};

/**
 * Decides which work date an event belongs to.
 *
 * Candidates are the previous, current and next local dates, because an
 * overnight shift started yesterday and a shift starting just before midnight
 * belongs to tomorrow. Each candidate's schedule is resolved and the event is
 * anchored to the one whose window contains it; ties go to the shift whose
 * scheduled interval is nearest.
 *
 * Unscheduled falls back to the local calendar date, which is the only
 * defensible answer when there is no shift to attach to.
 */
export function anchorWorkDate(
  occurredAt: Date,
  inputs: ScheduleInputs,
): AnchorResult {
  const localKey = dateKeyInZone(occurredAt, inputs.timeZone);
  const beforeMs = ANCHOR_BEFORE_START_MINUTES * 60_000;
  const afterMs = ANCHOR_AFTER_END_MINUTES * 60_000;
  const t = occurredAt.getTime();

  /** Distance to the scheduled interval; zero while the shift is running. */
  const distanceTo = (schedule: ResolvedSchedule): number => {
    const start = schedule.scheduledStart.getTime();
    const end = schedule.scheduledEnd.getTime();
    if (t < start) return start - t;
    if (t > end) return t - end;
    return 0;
  };

  const candidates = [-1, 0, 1]
    .map((offset) => shiftDateKey(localKey, offset))
    .map((key) => ({ key, schedule: resolveScheduleForDate(key, inputs) }))
    .filter((candidate): candidate is { key: string; schedule: ResolvedSchedule } =>
      candidate.schedule !== null,
    )
    .filter(
      ({ schedule }) =>
        t >= schedule.scheduledStart.getTime() - beforeMs &&
        t <= schedule.scheduledEnd.getTime() + afterMs,
    );

  if (candidates.length === 0) return { workDateKey: localKey, schedule: null };

  // Distance to the whole interval, not to its start. A clock-out two hours
  // into overtime is nearer the shift it belongs to than to one starting later
  // that evening, and measuring from the start alone gets that backwards.
  const best = candidates.reduce((closest, candidate) =>
    distanceTo(candidate.schedule) < distanceTo(closest.schedule) ? candidate : closest,
  );

  return { workDateKey: best.key, schedule: best.schedule };
}
