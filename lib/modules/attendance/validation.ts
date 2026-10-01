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

  // -1 disables auto-close entirely. 0 to 720 minutes defines the grace window.
  autoCloseGraceMinutes: z.coerce.number().int().min(-1).max(12 * 60),
  /// Below a minute the window cannot absorb ordinary clock skew between a
  /// terminal and a phone; above an hour it starts swallowing real second
  /// punches, like a genuine return from a break.
  dedupWindowMinutes: z.coerce.number().int().min(1).max(60),
  /// Retro manual entry is the least-verified path in the system. A long
  /// window makes fabricating history easy and hard to notice.
  maxManualEntryDays: z.coerce.number().int().min(0).max(90),

  branchManagerCanAuthorizeOvertime: z.boolean().default(false),
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

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

export const holidaySchema = z.object({
  dateKey,
  name: z.string().trim().min(2, "Name the holiday").max(80),
  confirmed: z.boolean(),
});

export const coverShiftSchema = z.object({
  branchId: z.string().min(1, "Choose the branch"),
  dateKey,
  shiftId: z.string().min(1, "Choose a shift"),
  employeeIds: z.array(z.string().min(1)).min(1, "Choose at least one person").max(100),
  reason: z.string().trim().min(3, "Say why, e.g. holiday supervision").max(200),
  /** Replace an override the person already has that day. */
  overwrite: z.boolean(),
});

export type CoverShiftInput = z.infer<typeof coverShiftSchema>;

export const patternSchema = z
  .object({
    name: z.string().trim().min(2, "Name the pattern").max(60),
    branchId: z.string().nullable(),
    cycle: z.array(z.string().min(1).nullable()).min(1, "Add at least one day").max(28, "At most 28 days"),
  })
  .refine((data) => data.cycle.some((day) => day !== null), {
    message: "A pattern needs at least one working day",
    path: ["cycle"],
  });

export type PatternFormInput = z.infer<typeof patternSchema>;

export const assignPatternSchema = z.object({
  branchId: z.string().min(1),
  /** Null ends the pattern for these people. */
  patternId: z.string().min(1).nullable(),
  employeeIds: z.array(z.string().min(1)).min(1, "Choose at least one person").max(300),
  startDateKey: dateKey,
  staggerDays: z.coerce.number().int().min(0).max(27),
});

export type AssignPatternFormInput = z.infer<typeof assignPatternSchema>;
