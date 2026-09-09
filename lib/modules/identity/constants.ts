/**
 * Client-safe identity constants. Kept out of `session.ts` so `proxy.ts` can
 * read the cookie name without pulling the JWT library into the proxy bundle.
 */

import { JobStatus, Role } from "@prisma/client";

export const SESSION_COOKIE_NAME = "basilissa_admin_session";

/**
 * Holds a half-finished sign-in between the password step and the second
 * factor. Deliberately a different cookie: a pending token must never be
 * mistakable for a session, and clearing one must not clear the other.
 */
export const MFA_PENDING_COOKIE_NAME = "basilissa_mfa_pending";

/**
 * Cookie for remembering a trusted device across sign-ins, bypassing the
 * second-factor challenge for 30 days unless revoked or sessionVersion is bumped.
 */
export const TRUSTED_DEVICE_COOKIE_NAME = "basilissa_trusted_device";
export const TRUSTED_DEVICE_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Multi-factor authentication for roles that can do real damage.
 *
 * Required, not offered, for the roles below. A Super Admin can grant
 * themselves any role and HR controls the rules deciding what people are paid;
 * a single reused password should not be all that stands in front of either.
 *
 * Lives here rather than in `mfa.ts` so the enforcement wiring can be checked
 * without importing the server-only service that acts on it. Every role listed
 * must hold `admin:access`, or it is told to enrol on a page it cannot reach —
 * `tests/mfa-enforcement.test.ts` asserts that.
 */
export const MFA_REQUIRED_ROLES: readonly Role[] = [
  Role.SUPER_ADMIN,
  Role.HR,
  Role.ADMINISTRATOR,
];

/**
 * How long a password reset link lasts.
 *
 * An hour: long enough to walk to a computer, short enough that a link left in
 * an inbox, a forwarded thread or a screenshot stops working before anyone
 * thinks to use it.
 *
 * Here rather than beside the reset service so the worker's housekeeping can
 * read it without importing anything request-scoped.
 */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export const EMAIL_JOB_TYPES = [
  "feedback.notify",
  "identity.password_reset_send",
  "assessments.invitation_send",
  "aptitude.invitation_send",
] as const;

export type EmailJobType = (typeof EMAIL_JOB_TYPES)[number];

export type FormattedEmailJob = {
  id: string;
  type: string;
  typeLabel: string;
  recipient: string;
  subject: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAt: Date;
  lastError: string | null;
  createdAt: Date;
  completedAt: Date | null;
  payload: Record<string, unknown>;
};
