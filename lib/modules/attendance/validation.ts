import { z } from "zod";
import { BreakPolicy } from "@prisma/client";

/**
 * Bounds on attendance policy.
 *
 * Every maximum here is a guard against a typo that would be expensive rather
 * than obvious: a 500-minute grace period is not a policy anyone chose, but it
 * would quietly stop lateness ever being recorded.
 */
export const attendancePolicySchema = z.object({
  graceInMinutes: z.coerce.number().int().min(0).max(120),
  graceOutMinutes: z.coerce.number().int().min(0).max(120),
  /// 0 means every minute past schedule is overtime, which is a valid choice.
  overtimeThresholdMinutes: z.coerce.number().int().min(0).max(240),

  breakPolicy: z.nativeEnum(BreakPolicy),
  autoDeductMinutes: z.coerce.number().int().min(0).max(240),
  autoDeductAfterMinutes: z.coerce.number().int().min(0).max(24 * 60),

  /// 0 disables rounding. Anything above 30 minutes distorts a shift badly
  /// enough that it should be a conversation, not a setting.
  roundingMinutes: z.coerce.number().int().min(0).max(30),

  autoCloseGraceMinutes: z.coerce.number().int().min(0).max(12 * 60),
  /// Below a minute the window cannot absorb ordinary clock skew between a
  /// terminal and a phone; above an hour it starts swallowing real second
  /// punches, like a genuine return from a break.
  dedupWindowMinutes: z.coerce.number().int().min(1).max(60),
  /// Retro manual entry is the least-verified path in the system. A long
  /// window makes fabricating history easy and hard to notice.
  maxManualEntryDays: z.coerce.number().int().min(0).max(90),

  isProvisional: z.boolean(),

  /// Ten characters, matching the threshold corrections use when there is no
  /// reason code to lean on. Short enough not to be an obstacle, long enough
  /// that "fix" and "." do not pass.
  changeReason: z
    .string()
    .trim()
    .min(10, "Say why this is changing \u2014 someone will ask in a year.")
    .max(500),
});

export type AttendancePolicyInput = z.infer<typeof attendancePolicySchema>;
