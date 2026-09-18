"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/platform/prisma";
import {
  adminLoginSchema,
  createUserSchema,
  forgotPasswordSchema,
  grantRoleSchema,
  resetPasswordSchema,
  userStatusSchema,
} from "./validation";
import { createUser, grantRole, revokeRole, setUserStatus } from "./user-admin";
import { getEnv, isEmailConfigured } from "@/lib/platform/env";
import { completePasswordReset, issuePasswordReset } from "./password-reset";
import { retryEmailJob, resendEmailJob, cancelEmailJob } from "./email-queue";
import { retryAnyJob, cancelAnyJob } from "./jobs-admin";
import { PASSWORD_RESET_SEND } from "./jobs";
import { enqueue } from "@/lib/platform/jobs";
import { fieldErrorsFrom } from "@/lib/platform/forms";
import {
  clearMfaPendingToken,
  createMfaPendingToken,
  createSession,
  deleteSession,
  isDeviceTrusted,
  readMfaPendingUserId,
  trustDevice,
} from "./session";
import {
  beginMfaEnrolment,
  confirmMfaEnrolment,
  hasMfaEnabled,
  recommendsMfa,
  requiresMfa,
  resetMfa,
  verifyMfaChallenge,
} from "./mfa";
import { requireAuth, requirePermission, verifySession } from "./dal";
import { can, isSuperAdmin } from "./authorization";
import { MFA_REQUIRED_ROLES, type RoleFormState } from "./constants";
import { roleSchema } from "./validation";
import {
  createCustomRole,
  updateCustomRole,
  deleteCustomRole,
  assignCustomRoleToUser,
} from "./custom-roles";
import { Role, ScopeType } from "@prisma/client";
import { formatAccraDateTime } from "@/lib/platform/date";
import { auditActorFrom } from "./audit";
import { revalidatePath } from "next/cache";
import { recordAuditBestEffort } from "@/lib/platform/audit";
import { scoped } from "@/lib/platform/logger";
import { rateLimit } from "@/lib/platform/rate-limit";
import type { FormState } from "@/lib/platform/forms";

export type { RoleFormState };
export type LoginFormState = { error?: string } | undefined;

// Computed once, at module load, by the same library used to hash real
// passwords — guaranteed to be a validly-formatted bcrypt hash. Comparing
// against it when no matching user exists keeps a failed login's response
// time close to a real one, so the endpoint doesn't leak which emails have
// an account via timing.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("no-such-user-placeholder-password", 10);

async function getClientIpFromHeaders(): Promise<string> {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return headerList.get("x-real-ip")?.trim() ?? "unknown";
}

export async function login(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const parsed = adminLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const ip = await getClientIpFromHeaders();
  const limit = await rateLimit(`admin-login:${ip}`, 10, 10 * 60 * 1000);
  if (!limit.success) {
    await recordSignInFailure(parsed.data.email, null, "RATE_LIMITED");
    return { error: "Too many login attempts. Please try again in a few minutes." };
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true,
      status: true,
      roleAssignments: { select: { role: true } },
    },
  });

  const passwordMatches = await bcrypt.compare(
    password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !passwordMatches) {
    await recordSignInFailure(email, user?.id ?? null, user ? "BAD_PASSWORD" : "NO_SUCH_USER");
    return { error: "Invalid email or password" };
  }

  // Suspended and terminated users get the same message as a wrong password.
  // Confirming that an account exists but is disabled tells an attacker which
  // addresses are real, and tells a dismissed employee exactly when their
  // access was cut. Both are avoidable disclosures.
  if (user.status !== "ACTIVE") {
    await recordSignInFailure(email, user.id, `STATUS_${user.status}`);
    return { error: "Invalid email or password" };
  }

  // Password proven. If this account has a second factor, check whether the device
  // is trusted. A trusted device bypasses the second factor challenge for 30 days.
  let mfaBypassedViaTrustedDevice = false;
  const userHasMfa = await hasMfaEnabled(user.id);
  if (userHasMfa) {
    const trusted = await isDeviceTrusted(user.id);
    if (!trusted) {
      await createMfaPendingToken(user.id);
      redirect("/admin/login/mfa");
    }
    mfaBypassedViaTrustedDevice = true;
  }

  const headerList = await headers();
  await createSession(user.id, headerList.get("user-agent") ?? undefined);

  await prisma.user
    .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    .catch((error) => scoped("identity").error("failed to record lastLoginAt", { error }));

  // Best-effort: the session already exists and the cookie is already set, so
  // throwing here would report a failed sign-in to someone who is signed in.
  await recordAuditBestEffort({
    actor: { userId: user.id, email, role: null },
    action: "user.signed_in",
    entityType: "User",
    entityId: user.id,
    metadata: mfaBypassedViaTrustedDevice ? { secondFactor: "trusted_device_bypass" } : undefined,
  });

  const roles = user.roleAssignments.map((ra) => ra.role);
  if (!userHasMfa) {
    if (requiresMfa(roles)) {
      redirect("/admin/settings?enrol=required");
    }
    if (recommendsMfa(roles)) {
      redirect("/admin/settings?enrol=suggested");
    }
  }

  redirect("/admin");
}

/**
 * Records a rejected sign-in.
 *
 * Best-effort throughout: an audit failure must never turn "wrong password"
 * into a server error, which would hand an attacker a denial-of-service on the
 * login page.
 *
 * The attempted address goes in `metadata`, not `actorEmail` — nothing about
 * it has been verified, and putting unverified input in the actor fields would
 * make the trail lie about who acted.
 */
async function recordSignInFailure(
  attemptedEmail: string,
  userId: string | null,
  reason: string,
): Promise<void> {
  await recordAuditBestEffort({
    actor: { userId: null, email: null, role: null },
    action: "user.sign_in_failed",
    entityType: "User",
    entityId: userId ?? "unknown",
    metadata: { attemptedEmail, reason },
  });
}

export async function logout() {
  // Read the actor before the session is destroyed, or there is nobody to
  // attribute the sign-out to.
  const actor = await verifySession();

  await deleteSession();

  if (actor) {
    await recordAuditBestEffort({
      actor: auditActorFrom(actor),
      action: "user.signed_out",
      entityType: "User",
      entityId: actor.userId,
    });
  }

  redirect("/admin/login");
}

export type MfaFormState = { error?: string } | undefined;

/**
 * Completes a sign-in that stopped at the second factor.
 *
 * Rate limited on its own key: without it, an attacker holding a valid password
 * could grind six digits at whatever speed the server allows, and the login
 * limiter has already been satisfied by that point.
 */
export async function submitMfaChallenge(
  _prevState: MfaFormState,
  formData: FormData,
): Promise<MfaFormState> {
  const userId = await readMfaPendingUserId();
  if (!userId) return { error: "That sign-in expired. Please start again." };

  const ip = await getClientIpFromHeaders();
  const limit = await rateLimit(`mfa-challenge:${userId}:${ip}`, 8, 10 * 60 * 1000);
  if (!limit.success) {
    return { error: "Too many attempts. Please try again in a few minutes." };
  }

  const code = String(formData.get("code") ?? "");
  const result = await verifyMfaChallenge(userId, code, {
    userId,
    email: null,
    role: null,
  });

  if (!result.ok) {
    // One message for a wrong code and for an account that is not enrolled,
    // so the response cannot be used to map who has MFA.
    return { error: "That code is not valid." };
  }

  const trustDeviceValue = String(formData.get("trustDevice") ?? "").toLowerCase();
  const shouldTrustDevice =
    trustDeviceValue === "yes" || trustDeviceValue === "on" || trustDeviceValue === "true";

  if (shouldTrustDevice) {
    await trustDevice(userId);
  }

  const headerList = await headers();
  await createSession(userId, headerList.get("user-agent") ?? undefined);
  await clearMfaPendingToken();

  await prisma.user
    .update({ where: { id: userId }, data: { lastLoginAt: new Date() } })
    .catch((error) => scoped("identity").error("failed to record lastLoginAt", { error }));

  await recordAuditBestEffort({
    actor: { userId, email: null, role: null },
    action: "user.signed_in",
    entityType: "User",
    entityId: userId,
    metadata: {
      secondFactor: result.usedRecoveryCode ? "recovery_code" : "totp",
      deviceTrusted: shouldTrustDevice,
    },
  });

  redirect("/admin");
}

export type EnrolmentState =
  | { step: "idle" }
  | { step: "started"; secret: string; uri: string }
  | { step: "confirmed"; recoveryCodes: string[] }
  | { step: "error"; error: string };

/** Generates a secret and shows it once. MFA stays off until a code verifies. */
export async function startMfaEnrolment(): Promise<EnrolmentState> {
  const actor = await requireAuth();
  const { secret, uri } = await beginMfaEnrolment(actor.userId, actor.email);
  return { step: "started", secret, uri };
}

/**
 * Confirms enrolment with a code from the app.
 *
 * Recovery codes are returned once and never again — they are stored hashed,
 * so nobody, including an administrator, can recover them later.
 */
export async function confirmMfa(
  _prevState: EnrolmentState,
  formData: FormData,
): Promise<EnrolmentState> {
  const actor = await requireAuth();

  const result = await confirmMfaEnrolment(
    actor.userId,
    String(formData.get("code") ?? ""),
    auditActorFrom(actor),
  );

  if (!result.ok) {
    return {
      step: "error",
      error:
        result.reason === "INVALID_CODE"
          ? "That code is not valid. Check your phone's clock is accurate and try the next one."
          : "Start the setup again.",
    };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin/security");
  return { step: "confirmed", recoveryCodes: result.recoveryCodes };
}

export type UserAdminState = (NonNullable<FormState> & { saved?: string }) | undefined;

/**
 * Clears a colleague's second factor after they have lost their phone and
 * codes. Audited loudly, and never on yourself.
 */
export async function resetUserMfa(
  _prevState: UserAdminState,
  formData: FormData,
): Promise<UserAdminState> {
  const actor = await requirePermission("user:write");
  const targetUserId = String(formData.get("userId") ?? "");

  const isTargetSuperAdmin = await prisma.roleAssignment.count({
    where: {
      userId: targetUserId,
      role: Role.SUPER_ADMIN,
      validFrom: { lte: new Date() },
      OR: [{ validTo: null }, { validTo: { gt: new Date() } }],
    },
  });
  if (isTargetSuperAdmin > 0 && !isSuperAdmin(actor)) {
    return {
      error: "Only a Super Admin can reset two-step verification for a Super Admin account.",
    };
  }

  const result = await resetMfa(targetUserId, auditActorFrom(actor));

  if (!result.ok) {
    return {
      error:
        result.reason === "SELF_RESET_FORBIDDEN"
          ? "You cannot reset your own two-step verification. Ask a colleague, that is the point of it."
          : "That account does not have two-step verification set up.",
    };
  }

  revalidatePath("/admin/users");
  return { saved: "Cleared. They will be asked to set it up again on their next sign-in." };
}

export type ForgotPasswordState = { sent?: boolean; error?: string } | undefined;

/**
 * Starts a password reset.
 *
 * ALWAYS reports the same thing. Whether the address is unknown, suspended or
 * a live super admin, the answer is "if that address has an account, a link is
 * on its way" — otherwise the form becomes a way to test which staff addresses
 * are real, and to learn who has been suspended.
 *
 * Rate limited on two keys. By address, so nobody can bury someone under reset
 * emails they did not ask for; by IP, so nobody can walk a list of addresses
 * looking for which ones are slow to answer.
 */
export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid email address" };
  }

  const email = parsed.data.email.trim().toLowerCase();
  const ip = await getClientIpFromHeaders();

  const [byIp, byEmail] = await Promise.all([
    rateLimit(`password-reset-ip:${ip}`, 10, 15 * 60 * 1000),
    rateLimit(`password-reset-email:${email}`, 3, 60 * 60 * 1000),
  ]);

  // Even the refusal is uniform: saying "too many for THAT address" would
  // confirm the address is worth rate limiting.
  if (!byIp.success || !byEmail.success) {
    scoped("identity").warn("password reset rate limited", { limitedBy: byIp.success ? "email" : "ip" });
    return { sent: true };
  }

  const issued = await issuePasswordReset(email);

  if (issued) {
    // Queued rather than sent inline: the send then retries on a transient
    // provider failure instead of the person waiting for an email that a
    // single blip lost. It also keeps the response time the same either way.
    await enqueue(PASSWORD_RESET_SEND, {
      email,
      token: issued.token,
      expiresAt: issued.expiresAt.toISOString(),
    });
  }

  return { sent: true };
}

export type ResetPasswordState =
  | { error?: string; fieldErrors?: Record<string, string> }
  | undefined;

/**
 * Finishes a password reset and sends the person to sign in.
 *
 * Deliberately does not create a session. Signing them in here would mean
 * access to an inbox is enough to bypass a second factor entirely; making them
 * sign in keeps the MFA challenge in the path.
 */
export async function submitPasswordReset(
  _prevState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const ip = await getClientIpFromHeaders();
  const limit = await rateLimit(`password-reset-submit:${ip}`, 20, 15 * 60 * 1000);
  if (!limit.success) {
    return { error: "Too many attempts. Please try again in a few minutes." };
  }

  const outcome = await completePasswordReset(parsed.data.token, parsed.data.password);

  if (!outcome.ok) {
    return {
      error:
        "This link is no longer usable. It may have expired, or already been used. " +
        "Request a new one and it will be sent straight away.",
    };
  }

  redirect("/admin/login?reset=1");
}

export type CreateUserState =
  | {
      error?: string;
      fieldErrors?: Record<string, string>;
      /**
       * Shown ONCE, and only when email is not configured, so an account can
       * still be set up. Handing the link to the creating administrator means
       * they could set the password themselves and act as that person, which
       * is why it is a fallback and why the audit entry records that it
       * happened this way rather than by email.
       */
      inviteUrl?: string;
      created?: { name: string; email: string };
    }
  | undefined;

export async function createUserAccount(
  _prevState: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const actor = await requirePermission("user:write");

  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const outcome = await createUser(parsed.data, auditActorFrom(actor));
  if (!outcome.ok) {
    return {
      error: outcome.message,
      fieldErrors: outcome.reason === "EMAIL_TAKEN" ? { email: "Already in use" } : undefined,
    };
  }

  const emailWorks = isEmailConfigured();

  if (outcome.invite && emailWorks) {
    await enqueue(PASSWORD_RESET_SEND, {
      email: parsed.data.email,
      token: outcome.invite.token,
      expiresAt: outcome.invite.expiresAt.toISOString(),
      purpose: "INVITE",
      name: parsed.data.name,
    });
  }

  if (outcome.invite && !emailWorks) {
    await recordAuditBestEffort({
      actor: auditActorFrom(actor),
      action: "user.invite_displayed",
      entityType: "User",
      entityId: outcome.userId,
      metadata: {
        reason: "email not configured",
        // Never the token. That an invite was shown is the auditable fact; the
        // link itself would turn the audit log into a credential store.
        shownTo: actor.email,
      },
    });
  }

  revalidatePath("/admin/users");
  return {
    created: parsed.data,
    inviteUrl:
      outcome.invite && !emailWorks
        ? `${getEnv().NEXT_PUBLIC_APP_URL}/admin/reset-password?token=${encodeURIComponent(outcome.invite.token)}`
        : undefined,
  };
}

export type RoleActionState = { error?: string; done?: boolean } | undefined;

export async function grantUserRole(
  _prevState: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  // role:assign, not user:write. HR can create accounts and cannot decide what
  // they may do — otherwise the person who onboards staff can quietly grant
  // themselves anything.
  const actor = await requirePermission("role:assign");

  const parsed = grantRoleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
    scopeType: formData.get("scopeType"),
    branchId: formData.get("branchId") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the role and scope." };
  }

  const outcome = await grantRole(parsed.data, auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${parsed.data.userId}`);
  return { done: true };
}

export async function revokeUserRole(
  _prevState: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  const actor = await requirePermission("role:assign");

  const assignmentId = String(formData.get("assignmentId") ?? "");
  if (!assignmentId) return { error: "Nothing to revoke." };

  const outcome = await revokeRole(assignmentId, auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath("/admin/users");
  return { done: true };
}

export async function changeUserStatus(
  _prevState: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  const actor = await requirePermission("user:write");

  const parsed = userStatusSchema.safeParse({
    userId: formData.get("userId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: "Unrecognised account status." };

  const outcome = await setUserStatus(
    parsed.data.userId,
    parsed.data.status,
    auditActorFrom(actor),
  );
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath("/admin/users");
  return { done: true };
}

/** Sends a fresh link to somebody who never used their invite, or lost it. */
export async function resendInvite(
  _prevState: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  const actor = await requirePermission("user:write");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "No address to send to." };

  const target = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      roleAssignments: {
        where: {
          role: Role.SUPER_ADMIN,
          validFrom: { lte: new Date() },
          OR: [{ validTo: null }, { validTo: { gt: new Date() } }],
        },
      },
    },
  });
  if (target && target.roleAssignments.length > 0 && !isSuperAdmin(actor)) {
    return {
      error: "Only a Super Admin can resend invites for a Super Admin account.",
    };
  }

  if (!isEmailConfigured()) {
    return {
      error:
        "Email is not configured, so no link can be sent. Ask them to use " +
        "\u201cForgotten password\u201d on the sign-in page instead.",
    };
  }

  const issued = await issuePasswordReset(email, "INVITE");
  // Same silence as the public form: whether the address resolved is not
  // something this response should reveal, even to an administrator, because
  // the answer is already on the page they came from.
  if (issued) {
    await enqueue(PASSWORD_RESET_SEND, {
      email,
      token: issued.token,
      expiresAt: issued.expiresAt.toISOString(),
      purpose: "INVITE",
    });
  }

  await recordAuditBestEffort({
    actor: auditActorFrom(actor),
    action: "user.invite_resent",
    entityType: "User",
    entityId: "unknown",
    metadata: { email },
  });

  return { done: true };
}

/**
 * Thin read-only wrapper so a client component (the user Sheet on the list)
 * can fetch one record, and re-fetch it after a mutation, without a full
 * page navigation. Same permission checks and shaping the page itself does.
 */
export async function getUserDetailAction(userId: string) {
  const actor = await requirePermission("user:read");

  const [user, branches, availableCustomRoles] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        lastLoginAt: true,
        passwordChangedAt: true,
        mfaEnabledAt: true,
        createdAt: true,
        customRoleId: true,
        customRole: { select: { id: true, name: true, description: true } },
        roleAssignments: {
          orderBy: { validFrom: "desc" },
          select: { id: true, role: true, scopeType: true, scopeId: true, validFrom: true, validTo: true },
        },
        _count: { select: { mfaRecoveryCodes: { where: { usedAt: null } } } },
      },
    }),
    prisma.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.customRole.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, description: true } }),
  ]);
  if (!user) return null;

  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const now = new Date();
  const activeAssignments = user.roleAssignments.filter((a) => a.validTo === null || a.validTo > now);
  const revokedAssignments = user.roleAssignments.filter((a) => a.validTo !== null && a.validTo <= now);

  const isTargetSuperAdmin =
    activeAssignments.some((a) => a.role === Role.SUPER_ADMIN) ||
    user.roleAssignments.some((a) => a.role === Role.SUPER_ADMIN);
  if (isTargetSuperAdmin && !isSuperAdmin(actor)) {
    return null;
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      passwordChangedAt: user.passwordChangedAt,
      mfaEnabledAt: user.mfaEnabledAt,
      createdAt: user.createdAt,
      mfaRecoveryCodesLeft: user._count.mfaRecoveryCodes,
      customRoleId: user.customRoleId,
      customRole: user.customRole,
    },
    canWrite: can(actor, "user:write"),
    canAssign: can(actor, "role:assign") || isSuperAdmin(actor),
    roles: Object.values(Role),
    branches,
    availableCustomRoles,
    isSelf: user.id === actor.userId,
    emailConfigured: isEmailConfigured(),
    active: activeAssignments.map((a) => ({
      id: a.id,
      role: a.role,
      scopeType: a.scopeType,
      scopeLabel: a.scopeType === ScopeType.BRANCH ? (branchName.get(a.scopeId) ?? "unknown branch") : "company-wide",
      since: formatAccraDateTime(a.validFrom),
      requiresMfa: MFA_REQUIRED_ROLES.includes(a.role),
    })),
    revoked: revokedAssignments.map((a) => ({
      id: a.id,
      role: a.role,
      scopeLabel: a.scopeType === ScopeType.BRANCH ? (branchName.get(a.scopeId) ?? "unknown branch") : "company-wide",
      endedAt: formatAccraDateTime(a.validTo!),
    })),
  };
}

/**
 * Resets a dead or stalled email job to pending for immediate pickup by the worker.
 * Super Admin only.
 */
export async function retryEmailJobAction(jobId: string): Promise<{ success: boolean; error?: string }> {
  const actor = await requirePermission("email_queue:manage");
  const result = await retryEmailJob(jobId, actor);
  if (result.success) {
    revalidatePath("/admin/email-queue");
    revalidatePath("/admin");
  }
  return result;
}

/**
 * Re-enqueues an identical copy of an email job.
 * Super Admin only.
 */
export async function resendEmailJobAction(
  jobId: string,
): Promise<{ success: boolean; newJobId?: string; error?: string }> {
  const actor = await requirePermission("email_queue:manage");
  const result = await resendEmailJob(jobId, actor);
  if (result.success) {
    revalidatePath("/admin/email-queue");
    revalidatePath("/admin");
  }
  return result;
}

/**
 * Cancels a pending email job so it will not be executed.
 * Super Admin only.
 */
export async function cancelEmailJobAction(jobId: string): Promise<{ success: boolean; error?: string }> {
  const actor = await requirePermission("email_queue:manage");
  const result = await cancelEmailJob(jobId, actor);
  if (result.success) {
    revalidatePath("/admin/email-queue");
    revalidatePath("/admin");
  }
  return result;
}

/**
 * Resets a dead or stalled background job to pending for immediate pickup by the worker.
 */
export async function retryAnyJobAction(jobId: string): Promise<{ success: boolean; error?: string }> {
  const actor = await requirePermission("jobs:manage");
  const result = await retryAnyJob(jobId, actor);
  if (result.success) {
    revalidatePath("/admin/jobs");
    revalidatePath("/admin/email-queue");
    revalidatePath("/admin");
  }
  return result;
}

/**
 * Cancels a pending background job so it will not be executed.
 */
export async function cancelAnyJobAction(jobId: string): Promise<{ success: boolean; error?: string }> {
  const actor = await requirePermission("jobs:manage");
  const result = await cancelAnyJob(jobId, actor);
  if (result.success) {
    revalidatePath("/admin/jobs");
    revalidatePath("/admin/email-queue");
    revalidatePath("/admin");
  }
  return result;
}

export async function createRoleAction(
  _prevState: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const actor = await requirePermission("roles:create");

  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "");
  const permissionsRaw = formData.getAll("permissions") as string[];

  const parsed = roleSchema.safeParse({
    name,
    description: description || null,
    permissions: permissionsRaw,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string") fieldErrors[field] = issue.message;
    }
    return { error: "Please fix the errors below.", fieldErrors };
  }

  const result = await createCustomRole(parsed.data, auditActorFrom(actor));
  if (!result.ok) {
    return {
      error: result.message,
      fieldErrors: result.reason === "ROLE_NAME_EXISTS" ? { name: result.message } : undefined,
    };
  }

  revalidatePath("/admin/roles");
  return { success: true, roleId: result.roleId };
}

export async function updateRoleAction(
  _prevState: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const actor = await requirePermission("roles:update");

  const roleId = String(formData.get("roleId") ?? "");
  if (!roleId) return { error: "Role ID is required." };

  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "");
  const permissionsRaw = formData.getAll("permissions") as string[];

  const parsed = roleSchema.safeParse({
    name,
    description: description || null,
    permissions: permissionsRaw,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string") fieldErrors[field] = issue.message;
    }
    return { error: "Please fix the errors below.", fieldErrors };
  }

  const result = await updateCustomRole(roleId, parsed.data, auditActorFrom(actor));
  if (!result.ok) {
    return {
      error: result.message,
      fieldErrors: result.reason === "ROLE_NAME_EXISTS" ? { name: result.message } : undefined,
    };
  }

  revalidatePath("/admin/roles");
  revalidatePath("/admin/users");
  return { success: true, roleId };
}

export async function deleteRoleAction(
  _prevState: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const actor = await requirePermission("roles:delete");

  const roleId = String(formData.get("roleId") ?? "");
  if (!roleId) return { error: "Role ID is required." };

  const result = await deleteCustomRole(roleId, auditActorFrom(actor));
  if (!result.ok) {
    return { error: result.message };
  }

  revalidatePath("/admin/roles");
  return { success: true };
}

export async function assignUserCustomRoleAction(
  _prevState: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const actor = await requirePermission("roles:assign");

  const userId = String(formData.get("userId") ?? "");
  const customRoleIdRaw = formData.get("customRoleId");
  const customRoleId = typeof customRoleIdRaw === "string" && customRoleIdRaw.trim() ? customRoleIdRaw.trim() : null;

  if (!userId) return { error: "User ID is required." };

  const result = await assignCustomRoleToUser(userId, customRoleId, auditActorFrom(actor));
  if (!result.ok) {
    return { error: result.message };
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { success: true };
}
