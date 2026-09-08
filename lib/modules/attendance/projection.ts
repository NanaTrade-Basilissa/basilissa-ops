import { AttendanceDirection, BreakPolicy, ProviderType } from "@prisma/client";
import type { AssuranceProfile } from "./assurance";
import { compareAssurance } from "./assurance";
import type { ResolvedPolicy } from "./policy";
import type { ResolvedSchedule } from "./schedule";

/**
 * The day projection: raw events in, payroll-facing figures out.
 *
 * A PURE FUNCTION, and everything depends on that. AttendanceDay is never
 * hand-edited — it is recomputed from immutable events, effective-dated policy
 * and the schedule that applied. That is what makes a correction six months
 * later tractable, what lets a calculation bug be fixed by replaying rather
 * than by patching rows, and what lets an auditor re-derive any figure
 * independently.
 *
 * Minutes are integers throughout. Floats have no place in something that
 * becomes wages.
 */

export type DayFlag =
  | "UNSCHEDULED"
  | "MISSING_CLOCK_IN"
  | "MISSING_CLOCK_OUT"
  | "DUPLICATE_CLOCK_IN"
  | "UNPAIRED_BREAK"
  | "MULTIPLE_SEGMENTS"
  | "MANUAL_ENTRY"
  | "AUTO_CLOSED"
  | "LOW_IDENTITY_ASSURANCE"
  | "CORRECTED"
  | "NO_EVENTS";

export type DayStatus = "PENDING" | "SETTLED" | "NEEDS_REVIEW";

/** The subset of an event the projection needs. */
export type ProjectionEvent = {
  id: string;
  direction: AttendanceDirection;
  occurredAt: Date;
  providerType: ProviderType;
  assurance: AssuranceProfile;
};

export type ProjectionInput = {
  workDateKey: string;
  /** Canonical events only — superseded and voided ones are already excluded. */
  events: readonly ProjectionEvent[];
  schedule: ResolvedSchedule | null;
  policy: ResolvedPolicy;
  /** Used to decide PENDING vs settled. Defaults to now. */
  asOf?: Date;
  /**
   * How many corrections have been applied to this day. Surfaced as a flag so
   * a corrected day is visibly corrected, but deliberately NOT blocking: once
   * the correction is made the day is settleable again, otherwise correcting
   * something would trap it in review forever.
   */
  correctionCount?: number;
};

export type ProjectedDay = {
  workDateKey: string;
  status: DayStatus;

  shiftId: string | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  scheduledMinutes: number;

  actualIn: Date | null;
  actualOut: Date | null;

  breakMinutes: number;
  grossMinutes: number;
  netWorkedMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;

  /** The weakest assurance across the day's events — what should drive review. */
  lowestAssurance: AssuranceProfile | null;
  flags: DayFlag[];

  /**
   * The policy actually used. Snapshotted so a dispute months later needs no
   * config archaeology, and so a later policy change cannot retroactively
   * change what this day was settled under.
   */
  policySnapshot: ResolvedPolicy;
};

const MINUTE = 60_000;

function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MINUTE);
}

/**
 * Rounds worked minutes to the configured granularity.
 *
 * Nearest, never down. Rounding is off by default and only ever applied because
 * someone chose it; when it is on, consistently rounding down would shave a few
 * minutes off every shift forever.
 */
function applyRounding(minutes: number, granularity: number): number {
  if (granularity <= 0) return minutes;
  return Math.round(minutes / granularity) * granularity;
}

type Walk = {
  segments: { start: Date; end: Date }[];
  breakMinutes: number;
  openSince: Date | null;
  flags: Set<DayFlag>;
};

/**
 * Walks the day's events in order, pairing clock-ins with clock-outs and
 * breaks with their ends.
 *
 * Pairs rather than first-to-last, because a split shift — in, out for three
 * hours, back in — is real, and measuring from first in to last out would pay
 * for the gap.
 */
function walkEvents(events: readonly ProjectionEvent[]): Walk {
  const flags = new Set<DayFlag>();
  const segments: { start: Date; end: Date }[] = [];
  let openSince: Date | null = null;
  let breakOpenSince: Date | null = null;
  let breakMinutes = 0;

  for (const event of [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())) {
    switch (event.direction) {
      case AttendanceDirection.IN:
        // Two clock-ins with no clock-out between them: keep the first, since
        // it is when the person actually started, and flag the day.
        if (openSince) flags.add("DUPLICATE_CLOCK_IN");
        else openSince = event.occurredAt;
        break;

      case AttendanceDirection.OUT:
        if (!openSince) {
          flags.add("MISSING_CLOCK_IN");
          break;
        }
        // No need to guard against an end before its start: events are walked
        // in chronological order, so `openSince` always precedes this one. A
        // clock-out recorded before its clock-in sorts ahead of it instead and
        // surfaces as MISSING_CLOCK_IN plus MISSING_CLOCK_OUT, crediting no
        // time and forcing review — which is the right outcome anyway.
        segments.push({ start: openSince, end: event.occurredAt });
        openSince = null;
        break;

      case AttendanceDirection.BREAK_START:
        if (breakOpenSince) flags.add("UNPAIRED_BREAK");
        else breakOpenSince = event.occurredAt;
        break;

      case AttendanceDirection.BREAK_END:
        if (!breakOpenSince) {
          flags.add("UNPAIRED_BREAK");
          break;
        }
        breakMinutes += Math.max(0, minutesBetween(breakOpenSince, event.occurredAt));
        breakOpenSince = null;
        break;
    }
  }

  if (openSince) flags.add("MISSING_CLOCK_OUT");
  if (breakOpenSince) flags.add("UNPAIRED_BREAK");
  if (segments.length > 1) flags.add("MULTIPLE_SEGMENTS");

  return { segments, breakMinutes, openSince, flags };
}

/** The weakest profile present, which is what a review queue should sort on. */
function lowestAssurance(events: readonly ProjectionEvent[]): AssuranceProfile | null {
  if (events.length === 0) return null;
  return events
    .map((event) => event.assurance)
    .reduce((weakest, current) => (compareAssurance(current, weakest) < 0 ? current : weakest));
}

export function projectDay(input: ProjectionInput): ProjectedDay {
  const { workDateKey, events, schedule, policy } = input;
  const asOf = input.asOf ?? new Date();

  const walk = walkEvents(events);
  const flags = walk.flags;

  if (events.length === 0) flags.add("NO_EVENTS");
  if (!schedule) flags.add("UNSCHEDULED");
  if (events.some((event) => event.providerType === ProviderType.MANAGER_MANUAL)) {
    flags.add("MANUAL_ENTRY");
  }
  if (events.some((event) => event.providerType === ProviderType.SYSTEM_AUTO_CLOSE)) {
    flags.add("AUTO_CLOSED");
  }
  if ((input.correctionCount ?? 0) > 0) flags.add("CORRECTED");

  const weakest = lowestAssurance(events);
  if (weakest && weakest.identity === "NONE" && events.length > 0) {
    flags.add("LOW_IDENTITY_ASSURANCE");
  }

  const actualIn = walk.segments[0]?.start ?? walk.openSince ?? null;
  const actualOut = walk.segments.at(-1)?.end ?? null;

  const grossMinutes = walk.segments.reduce(
    (total, segment) => total + minutesBetween(segment.start, segment.end),
    0,
  );

  // Explicit punches use what was actually recorded; auto-deduct removes a
  // fixed break once the shift is long enough to have had one.
  const breakMinutes =
    policy.breakPolicy === BreakPolicy.AUTO_DEDUCT
      ? grossMinutes >= policy.autoDeductAfterMinutes
        ? policy.autoDeductMinutes
        : 0
      : walk.breakMinutes;

  const netBeforeRounding = Math.max(0, grossMinutes - breakMinutes);
  const netWorkedMinutes = applyRounding(netBeforeRounding, policy.roundingMinutes);

  // Measured from the resolved instants rather than the template, so an
  // overnight shift is simply end-minus-start with no special casing.
  const scheduledMinutes = schedule
    ? minutesBetween(schedule.scheduledStart, schedule.scheduledEnd)
    : 0;

  let lateMinutes = 0;
  let earlyDepartureMinutes = 0;
  let overtimeMinutes = 0;
  let regularMinutes = netWorkedMinutes;

  if (schedule) {
    if (actualIn) {
      lateMinutes = Math.max(
        0,
        minutesBetween(schedule.scheduledStart, actualIn) - policy.graceInMinutes,
      );
    }
    if (actualOut) {
      earlyDepartureMinutes = Math.max(
        0,
        minutesBetween(actualOut, schedule.scheduledEnd) - policy.graceOutMinutes,
      );
    }

    regularMinutes = Math.min(netWorkedMinutes, scheduledMinutes);

    // The threshold GATES overtime rather than being deducted from it: work
    // less than it past your shift and none of it counts, work more and all of
    // it does. Deducting instead would shave the threshold off every claim
    // forever, which is the rounding-down problem wearing a different hat.
    const beyondSchedule = netWorkedMinutes - scheduledMinutes;
    overtimeMinutes = beyondSchedule > policy.overtimeThresholdMinutes ? beyondSchedule : 0;

    // An auto-closed shift never earns overtime, even if the arithmetic says
    // otherwise. Nobody recorded leaving, so the end is an assumption — and
    // someone who clocked in early would otherwise be credited overtime purely
    // because they forgot to clock out. Auto-awarding time for a missing punch
    // is the primary fraud vector; the day stays flagged for a manager to
    // correct with evidence.
    if (flags.has("AUTO_CLOSED")) overtimeMinutes = 0;
  }

  // A day nobody can finish calculating must never look settled. Anything
  // flagged needs a person; anything still running is simply not done yet.
  const blocking: DayFlag[] = [
    "MISSING_CLOCK_IN",
    "MISSING_CLOCK_OUT",
    "DUPLICATE_CLOCK_IN",
    "UNPAIRED_BREAK",
    "MANUAL_ENTRY",
    "UNSCHEDULED",
    "AUTO_CLOSED",
    "LOW_IDENTITY_ASSURANCE",
  ];

  let status: DayStatus;
  if (events.length === 0) {
    status = schedule && asOf.getTime() < schedule.scheduledEnd.getTime() ? "PENDING" : "NEEDS_REVIEW";
  } else if (blocking.some((flag) => flags.has(flag))) {
    status = "NEEDS_REVIEW";
  } else if (schedule && asOf.getTime() < schedule.scheduledEnd.getTime()) {
    status = "PENDING";
  } else {
    status = "SETTLED";
  }

  return {
    workDateKey,
    status,
    shiftId: schedule?.shiftId ?? null,
    scheduledStart: schedule?.scheduledStart ?? null,
    scheduledEnd: schedule?.scheduledEnd ?? null,
    scheduledMinutes,
    actualIn,
    actualOut,
    breakMinutes,
    grossMinutes,
    netWorkedMinutes,
    regularMinutes,
    overtimeMinutes,
    lateMinutes,
    earlyDepartureMinutes,
    lowestAssurance: weakest,
    // Sorted so two projections of the same day are byte-identical, which is
    // what makes the replay guarantee checkable.
    flags: [...flags].sort(),
    policySnapshot: policy,
  };
}
