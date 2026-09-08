import { ManualEntryReason } from "@prisma/client";

/**
 * Guard rails for manager manual entry, kept pure so they can be tested
 * exhaustively.
 *
 * Manual entry is the only path with no verification of any kind — no
 * biometric, no location, no trusted clock — and it is the one available first
 * and used precisely when something else has failed. "Heavily audited" is not a
 * sufficient control on its own, so the rules below sit in front of it.
 */

export type ManualEntryContext = {
  /** The user recording it. */
  actorUserId: string;
  /** The employee record belonging to that user, if they have one. */
  actorEmployeeId: string | null;
  targetEmployeeId: string;
  occurredAt: Date;
  now: Date;
  maxRetroDays: number;
  reasonCode: ManualEntryReason;
  reasonText: string;
};

export type ManualEntryRefusal =
  | "SELF_ENTRY_FORBIDDEN"
  | "RETRO_LIMIT_EXCEEDED"
  | "FUTURE_TIMESTAMP"
  | "REASON_TEXT_REQUIRED";

export type ManualEntryCheck =
  | { allowed: true; requiresSecondApproval: boolean }
  | { allowed: false; reason: ManualEntryRefusal; message: string };

/**
 * Entries older than this need someone other than the person recording them.
 * Recent corrections are ordinary housekeeping; reaching back a week to add
 * hours is the shape fabrication takes.
 */
export const SECOND_APPROVAL_AFTER_DAYS = 2;

/** Free text is required even alongside a code, except where the code says everything. */
const CODES_NEEDING_TEXT: ManualEntryReason[] = [ManualEntryReason.OTHER];

export function checkManualEntry(context: ManualEntryContext): ManualEntryCheck {
  // Nobody records their own attendance, whatever their role. A manager who
  // can create their own hours with no verification is the single easiest
  // fraud in the system, and it costs nothing to forbid.
  if (
    context.actorEmployeeId !== null &&
    context.actorEmployeeId === context.targetEmployeeId
  ) {
    return {
      allowed: false,
      reason: "SELF_ENTRY_FORBIDDEN",
      message: "You cannot record your own attendance. Ask your area manager.",
    };
  }

  if (context.occurredAt.getTime() > context.now.getTime()) {
    return {
      allowed: false,
      reason: "FUTURE_TIMESTAMP",
      message: "Attendance cannot be recorded for a time that has not happened.",
    };
  }

  const ageDays = (context.now.getTime() - context.occurredAt.getTime()) / 86_400_000;
  if (ageDays > context.maxRetroDays) {
    return {
      allowed: false,
      reason: "RETRO_LIMIT_EXCEEDED",
      message: `Manual entry is limited to ${context.maxRetroDays} days. Ask HR to record anything older.`,
    };
  }

  // A code alone is unanalysable in the specific case, and free text alone
  // cannot be counted across branches. OTHER without an explanation is just a
  // blank.
  if (CODES_NEEDING_TEXT.includes(context.reasonCode) && context.reasonText.trim().length < 3) {
    return {
      allowed: false,
      reason: "REASON_TEXT_REQUIRED",
      message: "Explain the reason when choosing Other.",
    };
  }

  return { allowed: true, requiresSecondApproval: ageDays > SECOND_APPROVAL_AFTER_DAYS };
}
