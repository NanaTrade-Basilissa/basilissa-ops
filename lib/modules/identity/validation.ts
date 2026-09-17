import { z } from "zod";
import { Role, ScopeType, UserStatus } from "@prisma/client";

export const adminLoginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
});

/**
 * Length over composition rules.
 *
 * Twelve characters with no character-class requirements: mandated symbols and
 * digits push people towards `Password1!` — predictable, and no stronger than
 * a longer ordinary phrase. The one explicit rule is that it cannot be all the
 * same character, which is the shape "aaaaaaaaaaaa" takes when someone is
 * trying to get past a length check.
 */
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z
      .string()
      .min(12, "Use at least 12 characters")
      .max(200, "That is longer than 200 characters")
      .refine((value) => new Set(value).size > 1, "Use more than one character"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "The two passwords do not match",
    path: ["confirmPassword"],
  });

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const createUserSchema = z.object({
  name: z.string().trim().min(2, "Enter their name").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
});

/**
 * A branch is required for BRANCH scope and forbidden for GLOBAL.
 *
 * Not merely tidiness: `scopeId` is the resolution key, and a GLOBAL row
 * carrying a branch id would match neither the global path nor the branch path
 * cleanly. It is normalised to an empty string in the service.
 */
export const grantRoleSchema = z
  .object({
    userId: z.string().min(1),
    role: z.nativeEnum(Role),
    scopeType: z.nativeEnum(ScopeType),
    branchId: z.string().trim().optional(),
  })
  .refine((d) => d.scopeType !== ScopeType.BRANCH || Boolean(d.branchId), {
    message: "Choose which branch this role applies to",
    path: ["branchId"],
  });

export const userStatusSchema = z.object({
  userId: z.string().min(1),
  status: z.nativeEnum(UserStatus),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type GrantRoleInput = z.infer<typeof grantRoleSchema>;

export const roleSchema = z.object({
  name: z.string().trim().min(2, "Role name must be at least 2 characters").max(64),
  description: z.string().trim().max(255).optional().nullable(),
  permissions: z.array(z.string()).default([]),
});

export type RoleInput = z.infer<typeof roleSchema>;
