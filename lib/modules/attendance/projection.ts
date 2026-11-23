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
  | "OVERTIME_PENDING_APPROVAL"
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
  /**
   * Overtime a manager has already authorised for this day. Calculated overtime
   * is what happened; only authorised overtime is payable, so any calculated
   * overtime with nothing authorised against it waits for a decision.
   */
  approvedOvertimeMinutes?: number;
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

  const isAutoClosed = flags.has("AUTO_CLOSED");
  // Strict shift-window boundary:
  // - Clocking in early BEFORE scheduledStart never counts as worked hours or overtime.
  // - Clocking out late AFTER scheduledEnd only counts up to pre-approved overtime
  //   (`approvedOvertimeMinutes`), and never when the shift was system auto-closed.
  const approvedOt =
    schedule && !isAutoClosed ? Math.max(0, input.approvedOvertimeMinutes ?? 0) : 0;
  const allowedStartMs = schedule ? schedule.scheduledStart.getTime() : null;
  const allowedEndMs = schedule
    ? schedule.scheduledEnd.getTime() + approvedOt * MINUTE
    : null;

  const grossMinutes = walk.segments.reduce((total, segment) => {
    if (allowedStartMs !== null && allowedEndMs !== null) {
      const clampedStart = Math.max(segment.start.getTime(), allowedStartMs);
      const clampedEnd = Math.min(segment.end.getTime(), allowedEndMs);
      if (clampedEnd <= clampedStart) return total;
      return total + Math.round((clampedEnd - clampedStart) / MINUTE);
    }
    return total + minutesBetween(segment.start, segment.end);
  }, 0);

  // Break minutes: configured directly on the individual shift template (schedule.unpaidBreakMinutes).
  // If the employee punched explicit breaks (walk.breakMinutes), those are respected.
  // When an unpaid break is defined on the shift template, it is automatically deducted from worked time.
  const templateBreak = schedule?.unpaidBreakMinutes ?? 0;
  const breakThreshold = policy.autoDeductAfterMinutes > 0 ? policy.autoDeductAfterMinutes : 300;
  let breakMinutes = walk.breakMinutes;

  if (schedule) {
    if (templateBreak > 0 && grossMinutes >= breakThreshold) {
      breakMinutes = Math.max(walk.breakMinutes, templateBreak);
    }
  } else if (policy.breakPolicy === BreakPolicy.AUTO_DEDUCT) {
    // Fallback for unscheduled days if an auto-deduct policy is active
    if (grossMinutes >= policy.autoDeductAfterMinutes) {
      breakMinutes = policy.autoDeductMinutes;
    }
  }

  const netBeforeRounding = Math.max(0, grossMinutes - breakMinutes);
  const netWorkedMinutes = applyRounding(netBeforeRounding, policy.roundingMinutes);

  // Scheduled working minutes: shift duration minus scheduled unpaid break.
  const scheduledSpan = schedule
    ? minutesBetween(schedule.scheduledStart, schedule.scheduledEnd)
    : 0;
  const scheduledMinutes = schedule
    ? Math.max(0, scheduledSpan - templateBreak)
    : 0;

  let lateMinutes = 0;
  let earlyDepartureMinutes = 0;
  let overtimeMinutes = 0;
  // Unscheduled days are NEVER payable (`regularMinutes = 0`) until a manager
  // approves the shift via a schedule override (e.g. EXTRA_SHIFT / SHIFT_CHANGE),
  // which re-projects the day with a real schedule. `netWorkedMinutes` still
  // records the punched duration for HR review.
  let regularMinutes = 0;

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

    // Overtime is strictly pre-approved overtime at the end of the shift,
    // capped to what the employee actually worked beyond scheduledMinutes.
    // Unapproved early arrivals and late departures never earn overtime, and
    // auto-closed shifts never earn overtime.
    overtimeMinutes =
      approvedOt > 0 && !isAutoClosed
        ? Math.min(Math.max(0, netWorkedMinutes - scheduledMinutes), approvedOt)
        : 0;
  }

  // Unscheduled late clock-outs are recorded silently in `overtimeMinutes` for
  // future analytics, but NEVER flagged for review: only pre-scheduled overtime
  // (`ScheduleExceptionType.OVERTIME`) counts as payable overtime.

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
