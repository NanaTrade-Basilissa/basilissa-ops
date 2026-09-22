import { EmploymentStatus } from "@prisma/client";
import { z } from "zod";

/**
 * An employee code is Basilissa's own identifier and stays stable whatever Odoo
 * later says. Constrained so it can be printed, read aloud and typed into a
 * terminal without ambiguity.
 */
export const employeeCodeSchema = z
  .string()
  .trim()
  .min(2, "Employee code must be at least 2 characters")
  .max(32, "Employee code must be at most 32 characters")
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Use letters, numbers, dots, dashes or underscores");

export const employeeListFilterSchema = z.object({
  branchId: z.string().optional(),
  status: z.nativeEnum(EmploymentStatus).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export type EmployeeListFilterInput = z.infer<typeof employeeListFilterSchema>;

export const employeeInputSchema = z.object({
  employeeCode: employeeCodeSchema,
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  jobTitle: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value ? value : null)),
  /**
   * How to reach them, not how they sign in — most employees never get an
   * account. Optional: plenty of staff genuinely have no address on file,
   * and that must not block creating the record. The empty-string-to-
   * `undefined` conversion happens at the call site, same as
   * `invitationSchema`'s email — so this only ever validates a real attempt.
   */
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .email("Enter a valid email address")
    .optional()
    .transform((value) => value ?? null),
  /** Also just contact info, same reasoning as `email` above. */
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((value) => (value ? value : null)),
  status: z.nativeEnum(EmploymentStatus),
  /** Empty means unknown rather than epoch, so it stays nullable. */
  hireDate: z
    .string()
    .optional()
    .transform((value) => (value ? new Date(`${value}T00:00:00.000Z`) : null))
    .refine((value) => value === null || !Number.isNaN(value.getTime()), "Invalid date"),
});

export type EmployeeInput = z.infer<typeof employeeInputSchema>;

export const branchAssignmentSchema = z.object({
  branchId: z.string().min(1, "Choose a branch"),
  isPrimary: z.boolean(),
  validFrom: z
    .string()
    .min(1, "A start date is required")
    .transform((value) => new Date(`${value}T00:00:00.000Z`))
    .refine((value) => !Number.isNaN(value.getTime()), "Invalid date"),
});

export const devicePinLinkSchema = z.object({
  deviceId: z.string().min(1, "Device is required"),
  pin: z
    .string()
    .trim()
    .min(1, "PIN is required")
    .max(20, "PIN must be at most 20 characters"),
});

export const shiftInputSchema = z
  .object({
    name: z.string().trim().min(2, "Name the shift").max(60),
    branchId: z
      .string()
      .optional()
      .transform((value) => (value ? value : null)),
    startMinute: z.coerce.number().int().min(0).max(1439),
    endMinute: z.coerce.number().int().min(0).max(1439),
    unpaidBreakMinutes: z.coerce.number().int().min(0).max(240),
    isActive: z.boolean(),
  })
  // A shift equal at both ends is either zero hours or twenty-four, and neither
  // is something anyone means to configure.
  .refine((data) => data.startMinute !== data.endMinute, {
    message: "A shift cannot start and end at the same time",
    path: ["endMinute"],
  });

export type ShiftInput = z.infer<typeof shiftInputSchema>;

export const shiftAssignmentSchema = z.object({
  shiftId: z.string().min(1, "Choose a shift"),
  daysOfWeek: z
    .array(z.coerce.number().int().min(1).max(7))
    .min(1, "Choose at least one day"),
  validFrom: z
    .string()
    .min(1, "A start date is required")
    .transform((value) => new Date(`${value}T00:00:00.000Z`))
    .refine((value) => !Number.isNaN(value.getTime()), "Invalid date"),
});

/** "08:30" from minutes past midnight, for display. */
export function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Minutes past midnight from an <input type="time"> value. */
export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}
