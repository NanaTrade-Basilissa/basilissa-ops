import { AttendanceDirection } from "@prisma/client";
import { compareAssurance, type AssuranceProfile } from "./assurance";

/**
 * Pure rules over raw attendance events: which way a punch goes, whether two
 * records describe the same action, and whether an event still counts.
 *
 * No Prisma, no I/O. These decide what reaches payroll.
 */

/** The subset of an event these rules need. A Prisma row satisfies it. */
export type EventLike = {
  id: string;
  direction: AttendanceDirection;
  occurredAt: Date;
  supersedesEventId: string | null;
  supersededByEventId: string | null;
};

// ---------------------------------------------------------------------------
// Derived status
// ---------------------------------------------------------------------------

export type EventStatus = "CANONICAL" | "SUPERSEDED" | "VOIDED";

/**
 * Whether an event still counts.
 *
 * Derived rather than stored, because the row is immutable — see the note in
 * the schema. An event is out if a correction voided it, if it recorded losing
 * to an existing event, or if some later event recorded superseding it.
 */
export function deriveStatus(
  event: EventLike,
  all: readonly EventLike[],
  voidedEventIds: ReadonlySet<string> = new Set(),
): EventStatus {
  if (voidedEventIds.has(event.id)) return "VOIDED";
  if (event.supersededByEventId !== null) return "SUPERSEDED";
  if (all.some((other) => other.supersedesEventId === event.id)) return "SUPERSEDED";
  return "CANONICAL";
}

/** The events that count, in chronological order. */
export function canonicalEvents<T extends EventLike>(
  all: readonly T[],
  voidedEventIds: ReadonlySet<string> = new Set(),
): T[] {
  return all
    .filter((event) => deriveStatus(event, all, voidedEventIds) === "CANONICAL")
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}

// ---------------------------------------------------------------------------
// Direction
// ---------------------------------------------------------------------------

export type DirectionInput = {
  /** What the provider claimed, if anything. Advisory only. */
  hint?: AttendanceDirection | null;
  /** The employee's canonical events already recorded for this work date. */
  priorEvents: readonly EventLike[];
};

export type DirectionResult = {
  direction: AttendanceDirection;
  /** True when the provider's hint disagreed. Recorded, not acted on. */
  hintMismatch: boolean;
};

/**
 * Derives which way a punch goes from the sequence so far.
 *
 * The provider's own claim is never obeyed. Terminal in/out buttons are
 * routinely ignored by staff, and a wrong state silently becoming an
 * authoritative clock-out is a payroll defect rather than a display glitch.
 * Disagreement is recorded so a device with a high mismatch rate shows up as
 * the data-quality problem it is.
 *
 * The state machine, from the last event that counts:
 *
 *   nothing yet   -> IN
 *   IN            -> OUT      (BREAK_START handled by the caller)
 *   BREAK_START   -> BREAK_END
 *   BREAK_END     -> OUT
 *   OUT           -> IN        a second shift the same day
 */
export function deriveDirection({ hint, priorEvents }: DirectionInput): DirectionResult {
  const last = [...priorEvents].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  )[priorEvents.length - 1];

  let direction: AttendanceDirection;
  if (!last) {
    direction = AttendanceDirection.IN;
  } else {
    switch (last.direction) {
      case AttendanceDirection.IN:
        direction = AttendanceDirection.OUT;
        break;
      case AttendanceDirection.BREAK_START:
        direction = AttendanceDirection.BREAK_END;
        break;
      case AttendanceDirection.BREAK_END:
        direction = AttendanceDirection.OUT;
        break;
      case AttendanceDirection.OUT:
        direction = AttendanceDirection.IN;
        break;
    }
  }

  return {
    direction,
    hintMismatch: hint != null && hint !== direction,
  };
}

/**
 * Direction for an incoming event, accounting for near-simultaneous duplicates.
 *
 * THE ORDERING HERE IS THE POINT, and it is the opposite of the obvious one.
 *
 * Someone punches the terminal and also opens the app. Deriving direction from
 * the sequence first would see the clock-out just recorded and conclude the
 * next event must be a clock-in — so the mirror gets stored as a fresh
 * clock-in, never matches on direction, never deduplicates, and leaves the day
 * with an unclosed shift and a missing clock-out that never happened.
 *
 * An event arriving within the dedup window is almost certainly the same real
 * action, so it inherits that action's direction instead of advancing the
 * state machine. Only outside the window does the sequence decide.
 */
export function directionForIncoming(
  occurredAt: Date,
  priorEvents: readonly EventLike[],
  hint: AttendanceDirection | null | undefined,
  dedupWindowMinutes: number,
): DirectionResult {
  const windowMs = dedupWindowMinutes * 60_000;

  const nearest = [...priorEvents]
    .filter((event) => Math.abs(event.occurredAt.getTime() - occurredAt.getTime()) <= windowMs)
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];

  if (nearest) {
    return {
      direction: nearest.direction,
      hintMismatch: hint != null && hint !== nearest.direction,
    };
  }

  // Only what happened BEFORE this event may decide its direction.
  //
  // Matters the moment a manager inserts a punch into the middle of a day. With
  // an existing 08:00 IN and 17:00 OUT, adding one at 12:00 should follow the
  // 08:00 and become an OUT. Reading the latest event overall would follow the
  // 17:00 instead and record a second clock-in, leaving the day with an
  // unclosed shift that never existed.
  const preceding = priorEvents.filter(
    (event) => event.occurredAt.getTime() <= occurredAt.getTime(),
  );

  return deriveDirection({ hint, priorEvents: preceding });
}

// ---------------------------------------------------------------------------
// Cross-provider deduplication
// ---------------------------------------------------------------------------

export type DedupCandidate = EventLike & { assurance: AssuranceProfile };

export type DedupOutcome =
  | { kind: "unique" }
  /** The incoming event wins; it records what it replaced. */
  | { kind: "supersedes"; eventId: string }
  /** The incoming event loses; it records what beat it. */
  | { kind: "superseded_by"; eventId: string };

/**
 * Decides what to do when an incoming event may duplicate an existing one.
 *
 * Three capture paths mean the same real action can legitimately arrive twice —
 * someone punches the terminal and also opens the app. That is ordinary
 * behaviour, not abuse.
 *
 * The higher-assurance record wins and the other is kept, linked and excluded
 * from calculation. Neither is ever dropped: an employee disputing a time needs
 * to see every signal the system received, not the one it happened to choose.
 *
 * Ties break toward the earlier event, which is the one closer to when the
 * person actually acted.
 */
export function resolveDuplicate(
  incoming: { direction: AttendanceDirection; occurredAt: Date; assurance: AssuranceProfile },
  existing: readonly DedupCandidate[],
  windowMinutes: number,
): DedupOutcome {
  const windowMs = windowMinutes * 60_000;

  const overlapping = existing.filter(
    (candidate) =>
      candidate.direction === incoming.direction &&
      Math.abs(candidate.occurredAt.getTime() - incoming.occurredAt.getTime()) <= windowMs,
  );

  if (overlapping.length === 0) return { kind: "unique" };

  const strongest = overlapping.reduce((best, candidate) =>
    compareAssurance(candidate.assurance, best.assurance) > 0 ? candidate : best,
  );

  const comparison = compareAssurance(incoming.assurance, strongest.assurance);
  if (comparison > 0) return { kind: "supersedes", eventId: strongest.id };
  if (comparison < 0) return { kind: "superseded_by", eventId: strongest.id };

  // Equal assurance: keep whichever happened first.
  return incoming.occurredAt.getTime() < strongest.occurredAt.getTime()
    ? { kind: "supersedes", eventId: strongest.id }
    : { kind: "superseded_by", eventId: strongest.id };
}
