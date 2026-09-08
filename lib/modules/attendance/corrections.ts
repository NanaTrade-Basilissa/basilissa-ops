import { CorrectionOperation, CorrectionReason } from "@prisma/client";

/**
 * Rules for correcting attendance. Pure, so they can be tested exhaustively.
 *
 * A correction never edits what was recorded. Adjusting a time voids the
 * original event and inserts a replacement, so the punch the terminal actually
 * produced and the value a manager decided both stay visible and separately
 * attributed. That is what makes a dispute months later answerable: "the device
 * said 08:47, the manager set 08:02 because the clock had drifted, their area
 * manager approved it" is a complete answer, where an edited row could only
 * ever say 08:02.
 */

export type CorrectionContext = {
  operation: CorrectionOperation;
  actorUserId: string;
  /** The employee record belonging to the actor, if they have one. */
  actorEmployeeId: string | null;
  targetEmployeeId: string;
  reasonCode: CorrectionReason;
  reasonText: string;
  /** Minutes of paid time this changes. Sign is irrelevant; size is not. */
  minutesDelta: number;
  /** True when the correction would newly create overtime. */
  createsOvertime: boolean;
  workDate: Date;
  now: Date;
};

export type CorrectionRefusal =
  | "SELF_CORRECTION_FORBIDDEN"
  | "REASON_TEXT_REQUIRED"
  | "TARGET_REQUIRED"
  | "NO_EFFECT";

export type CorrectionCheck =
  | { allowed: true; requiresApproval: boolean; reasons: string[] }
  | { allowed: false; reason: CorrectionRefusal; message: string };

/**
 * Thresholds above which a correction needs someone other than its author.
 *
 * Small same-week fixes are ordinary housekeeping and requiring sign-off for
 * them only trains people to rubber-stamp. Large ones, ones that create paid
 * overtime, and ones reaching back into a period likely already reported are
 * where a second pair of eyes is worth having.
 */
export const MATERIAL_MINUTES = 15;
export const MATERIAL_AGE_DAYS = 7;

/** Why a correction is material, or an empty list if it is not. */
export function materialityReasons(context: CorrectionContext): string[] {
  const reasons: string[] = [];

  if (Math.abs(context.minutesDelta) > MATERIAL_MINUTES) {
    reasons.push(`changes paid time by ${Math.abs(context.minutesDelta)} minutes`);
  }
  if (context.createsOvertime) {
    reasons.push("creates payable overtime");
  }

  const ageDays = (context.now.getTime() - context.workDate.getTime()) / 86_400_000;
  if (ageDays > MATERIAL_AGE_DAYS) {
    reasons.push(`reaches back ${Math.floor(ageDays)} days`);
  }

  return reasons;
}

export function checkCorrection(context: CorrectionContext): CorrectionCheck {
  // Nobody corrects their own attendance, whatever their role. A manager who
  // can adjust their own hours with no second party is the same fraud as
  // manual self-entry wearing a different name.
  if (
    context.actorEmployeeId !== null &&
    context.actorEmployeeId === context.targetEmployeeId
  ) {
    return {
      allowed: false,
      reason: "SELF_CORRECTION_FORBIDDEN",
      message: "You cannot correct your own attendance. Ask your area manager.",
    };
  }

  if (
    context.operation !== CorrectionOperation.INSERT_EVENT &&
    context.reasonText.trim().length < 3
  ) {
    return {
      allowed: false,
      reason: "REASON_TEXT_REQUIRED",
      message: "Explain why this attendance is being changed.",
    };
  }

  // A code alone cannot answer "why this one"; OTHER with nothing written is a
  // blank pretending to be a reason.
  if (context.reasonCode === CorrectionReason.OTHER && context.reasonText.trim().length < 10) {
    return {
      allowed: false,
      reason: "REASON_TEXT_REQUIRED",
      message: "Describe the reason when choosing Other.",
    };
  }

  const reasons = materialityReasons(context);
  return { allowed: true, requiresApproval: reasons.length > 0, reasons };
}

/**
 * Which events a set of corrections removes from calculation.
 *
 * The rows are never deleted; the projection simply stops counting them. A
 * voided punch stays visible to anyone reading the day's history.
 */
export function voidedEventIds(
  corrections: readonly { operation: CorrectionOperation; targetEventId: string | null }[],
): Set<string> {
  const voided = new Set<string>();
  for (const correction of corrections) {
    const removesTarget =
      correction.operation === CorrectionOperation.VOID_EVENT ||
      // Adjusting a time or a branch replaces the event rather than editing it,
      // so the original stops counting the moment its replacement exists.
      correction.operation === CorrectionOperation.ADJUST_TIME ||
      correction.operation === CorrectionOperation.REASSIGN_BRANCH;

    if (removesTarget && correction.targetEventId) voided.add(correction.targetEventId);
  }
  return voided;
}
