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
  /** Recurring assignments to this shift stop on public holidays. */
  offOnPublicHolidays: boolean;
};

export type AssignmentLike = {
  shiftId: string;
  /** ISO weekdays: 1 = Monday … 7 = Sunday. */
  daysOfWeek: number[];
  validFrom: Date;
  validTo: Date | null;
};

/**
 * A person on a rota pattern. Only patterns that apply live belong here: a
 * branch on manual rota has its weeks generated into exceptions instead.
 */
export type PatternLike = {
  /** Local date on which the person is on day 0 of the cycle. */
  anchorDateKey: string;
  /** The cycle, one entry per day: a shift id, or null for a day off. */
  cycle: readonly (string | null)[];
  validFrom: Date;
  validTo: Date | null;
};

export type ExceptionLike = {
  /** Local calendar date, "YYYY-MM-DD". */
  dateKey: string;
  type: ScheduleExceptionType;
  shiftId: string | null;
  /** A cover shift's branch; null or absent for the usual branch. */
  branchId?: string | null;
};

export type ScheduleInputs = {
  timeZone: string;
  shifts: readonly ShiftTemplate[];
  assignments: readonly AssignmentLike[];
  exceptions: readonly ExceptionLike[];
  /**
   * Local dates ("YYYY-MM-DD") that are public holidays. Required rather than
   * optional so that every caller has to load them: a caller that forgot would
   * silently mark the office absent on every holiday.
   */
  holidays: ReadonlySet<string>;
  /** Required for the same reason: a forgotten pattern silently becomes 8-5. */
  patterns: readonly PatternLike[];
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
  source: "exception" | "pattern" | "assignment";
  /** Set when the day is a cover shift at another branch. */
  coverBranchId: string | null;
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

/** Whole days from one local date to another; negative when `to` is earlier. */
function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

/**
 * Where a person is in their cycle on a date: the shift id, or null for a day
 * off. Wraps backwards too, though a pattern never applies before it starts.
 */
export function patternDayFor(dateKey: string, pattern: Pick<PatternLike, "anchorDateKey" | "cycle">): string | null {
  const length = pattern.cycle.length;
  if (length === 0) return null;
  const index = ((daysBetween(pattern.anchorDateKey, dateKey) % length) + length) % length;
  return pattern.cycle[index] ?? null;
}

function isAssignmentInEffect(assignment: Pick<AssignmentLike, "validFrom" | "validTo">, dayStart: Date): boolean {
  if (assignment.validFrom.getTime() > dayStart.getTime()) return false;
  return assignment.validTo === null || assignment.validTo.getTime() > dayStart.getTime();
}

function build(
  shift: ShiftTemplate,
  workDateKey: string,
  timeZone: string,
  source: ResolvedSchedule["source"],
  coverBranchId: string | null = null,
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
    coverBranchId,
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
 *
 * A rota pattern sits between 1 and 2 and, when in effect, decides the day
 * outright: a day off in the cycle is a day off, never a fall-through to the
 * recurring 8-5 underneath. That fall-through was the bug week-by-week rotas
 * kept hitting.
 *
 * Public holidays only touch recurring schedules, and only for shifts marked
 * `offOnPublicHolidays`: the office's 8-5 stops, a branch's recurring rota does
 * not. An exception is someone's deliberate decision about that exact day, so
 * it applies on a holiday like any other day; that is how people are rostered
 * to work one.
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
    if (shift) return build(shift, workDateKey, timeZone, "exception", exception.branchId ?? null);
  }

  const pattern = inputs.patterns
    .filter((entry) => isAssignmentInEffect(entry, dayStart))
    .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime())[0];
  if (pattern) {
    const shiftId = patternDayFor(workDateKey, pattern);
    if (shiftId === null) return null;
    const shift = findShift(shifts, shiftId);
    if (shift) {
      if (shift.offOnPublicHolidays && inputs.holidays.has(workDateKey)) return null;
      return build(shift, workDateKey, timeZone, "pattern");
    }
    // A pattern naming a shift that no longer exists is bad data, not a day
    // off: fall through so the person still has a schedule.
  }

  const weekday = isoWeekdayInZone(dayStart, timeZone);
  const assignment = assignments
    .filter((entry) => isAssignmentInEffect(entry, dayStart) && entry.daysOfWeek.includes(weekday))
    // Most recently effective wins, so overlapping assignments are deterministic.
    .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime())[0];

  if (!assignment) return null;

  const shift = findShift(shifts, assignment.shiftId);
  if (!shift) return null;
  if (shift.offOnPublicHolidays && inputs.holidays.has(workDateKey)) return null;
  return build(shift, workDateKey, timeZone, "assignment");
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

/**
 * Whether a punch belongs to a cover shift, so it may be accepted at a branch
 * the person is not assigned to.
 *
 * Uses the same window as anchoring: from four hours before the shift starts to
 * eight hours after it ends. A cover shift is permission for that shift, not
 * for the whole day or the days around it, so an early arrival is fine and a
 * punch the next afternoon is not.
 */
export function punchFallsInCoverShift(
  occurredAt: Date,
  cover: { dateKey: string; shift: ShiftTemplate },
  timeZone: string,
): boolean {
  const scheduled = build(cover.shift, cover.dateKey, timeZone, "exception");
  const t = occurredAt.getTime();
  return (
    t >= scheduled.scheduledStart.getTime() - ANCHOR_BEFORE_START_MINUTES * 60_000 &&
    t <= scheduled.scheduledEnd.getTime() + ANCHOR_AFTER_END_MINUTES * 60_000
  );
}

/** Less rest than this between two shifts is flagged when building a pattern. */
export const MIN_REST_MINUTES = 10 * 60;

/**
 * Days in a cycle where the rest after the previous day's shift is short, e.g.
 * an Evening ending 23:00 followed by a Morning at 07:00. The cycle wraps, so
 * the last day is checked against the first. Advice for whoever builds the
 * pattern, not a rule: some teams choose quick turnarounds.
 */
export function shortRestDays(
  cycle: readonly (string | null)[],
  shifts: readonly Pick<ShiftTemplate, "id" | "startMinute" | "endMinute">[],
): { dayIndex: number; restMinutes: number }[] {
  const byId = new Map(shifts.map((shift) => [shift.id, shift]));
  const result: { dayIndex: number; restMinutes: number }[] = [];
  if (cycle.length < 2) return result;

  cycle.forEach((shiftId, dayIndex) => {
    const previousId = cycle[(dayIndex - 1 + cycle.length) % cycle.length];
    const today = shiftId ? byId.get(shiftId) : undefined;
    const previous = previousId ? byId.get(previousId) : undefined;
    if (!today || !previous) return;
    // Minutes from the previous day's local midnight: its end, and today's start.
    const previousEnd = previous.endMinute <= previous.startMinute ? previous.endMinute + 1440 : previous.endMinute;
    const restMinutes = today.startMinute + 1440 - previousEnd;
    if (restMinutes < MIN_REST_MINUTES) result.push({ dayIndex, restMinutes });
  });
  return result;
}
