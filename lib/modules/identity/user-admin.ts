import "server-only";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma, Role, ScopeType, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { recordAudit, type AuditActor } from "@/lib/platform/audit";
import { scoped } from "@/lib/platform/logger";
import { bumpSessionVersion } from "./session";
import { issuePasswordReset, type IssuedReset } from "./password-reset";

const log = scoped("identity.user-admin");

export type AdminFailure =
  | "EMAIL_TAKEN"
  | "BRANCH_REQUIRED"
  | "BRANCH_NOT_FOUND"
  | "SELF_ACTION_FORBIDDEN"
  | "LAST_SUPER_ADMIN"
  | "USER_NOT_FOUND";

export type CreateUserOutcome =
  | { ok: true; userId: string; invite: IssuedReset | null }
  | { ok: false; reason: AdminFailure; message: string };

/**
 * Creates an account and issues a link for the person to choose their own
 * password.
 *
 * THE ADMINISTRATOR NEVER SETS THE PASSWORD. The row is created with a hash of
 * random bytes that are then discarded, so the account cannot be signed into
 * by anybody — including whoever created it — until the invite is redeemed.
 * An administrator who types the first password knows a working credential for
 * somebody else, and every action that person takes afterwards is deniable.
 */
export async function createUser(
  input: { name: string; email: string },
  actor: AuditActor,
): Promise<CreateUserOutcome> {
  const email = input.email.trim().toLowerCase();

  /*
    Checked before inserting, not only caught afterwards. The unique constraint
    is still the authority — two administrators submitting the same address at
    once must not both succeed — but a duplicate address is an ordinary typo,
    and letting it reach Postgres emits a `prisma:error` line for something
    that is not an error. In production that trains people to ignore the log.
  */
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return {
      ok: false,
      reason: "EMAIL_TAKEN",
      message: "An account with that email address already exists.",
    };
  }

  // Unguessable and unrecorded. bcrypt truncates at 72 bytes, so 48 random
  // bytes base64url-encoded is comfortably inside the limit and still far
  // beyond brute force.
  const unusable = randomBytes(48).toString("base64url");

  let userId: string;
  try {
    const created = await prisma.user.create({
      data: {
        name: input.name.trim(),
        email,
        passwordHash: await bcrypt.hash(unusable, 12),
        status: UserStatus.ACTIVE,
        // Null means "never chosen one", which is what the invite is for.
        passwordChangedAt: null,
      },
      select: { id: true },
    });
    userId = created.id;
  } catch (error) {
    // Reached only by a genuine race with another administrator, which is
    // rare enough that the log line is worth having.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        ok: false,
        reason: "EMAIL_TAKEN",
        message: "An account with that email address already exists.",
      };
    }
    throw error;
  }

  await recordAudit({
    actor,
    action: "user.created",
    entityType: "User",
    entityId: userId,
    after: { name: input.name.trim(), email, status: UserStatus.ACTIVE },
  });

  // Reuses the password reset token: same single-use, same hour, same storage.
  // A separate invite token would be the same code with a different name.
  const invite = await issuePasswordReset(email, "INVITE");

  log.info("user created", { userId, invited: invite !== null });
  return { ok: true, userId, invite };
}

export type GrantOutcome =
  | { ok: true; assignmentId: string }
  | { ok: false; reason: AdminFailure; message: string };

/**
 * Grants a role, at global scope or over one branch.
 *
 * Re-granting a previously revoked role reactivates the same row rather than
 * inserting a second one, because `@@unique([userId, role, scopeType, scopeId])`
 * makes two rows impossible. The assignment table therefore shows the CURRENT
 * grant, not its history — the history lives in the audit log, which is
 * append-only and records both sides of every change.
 */
export async function grantRole(
  input: { userId: string; role: Role; scopeType: ScopeType; branchId?: string | null },
  actor: AuditActor,
): Promise<GrantOutcome> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true },
  });
  if (!user) return { ok: false, reason: "USER_NOT_FOUND", message: "No such account." };

  // GLOBAL stores an empty string, never null: Postgres treats NULLs as
  // distinct in a unique constraint, so a nullable scope would let the same
  // global role be granted twice.
  let scopeId = "";
  if (input.scopeType === ScopeType.BRANCH) {
    if (!input.branchId) {
      return {
        ok: false,
        reason: "BRANCH_REQUIRED",
        message: "Choose which branch this role applies to.",
      };
    }
    const branch = await prisma.branch.findUnique({
      where: { id: input.branchId },
      select: { id: true },
    });
    if (!branch) return { ok: false, reason: "BRANCH_NOT_FOUND", message: "No such branch." };
    scopeId = branch.id;
  }

  const now = new Date();
  const assignment = await prisma.roleAssignment.upsert({
    where: {
      userId_role_scopeType_scopeId: {
        userId: user.id,
        role: input.role,
        scopeType: input.scopeType,
        scopeId,
      },
    },
    create: {
      userId: user.id,
      role: input.role,
      scopeType: input.scopeType,
      scopeId,
      validFrom: now,
      grantedBy: actor.userId,
    },
    // Reactivating: clear the revocation and start a fresh period.
    update: { validFrom: now, validTo: null, grantedBy: actor.userId },
    select: { id: true },
  });

  await recordAudit({
    actor,
    action: "user.role_granted",
    entityType: "User",
    entityId: user.id,
    after: { role: input.role, scopeType: input.scopeType, scopeId },
    metadata: { assignmentId: assignment.id, targetEmail: user.email },
  });

  /*
    No sessionVersion bump. Assignments are re-read from the database on every
    request (see getSession), filtered by validFrom/validTo, so a grant or a
    revocation takes effect on the person's next request already. Bumping would
    sign them out of every device to achieve something that has already
    happened.
  */
  log.info("role granted", { userId: user.id, role: input.role, scopeType: input.scopeType });
  return { ok: true, assignmentId: assignment.id };
}

export type RevokeOutcome = { ok: true } | { ok: false; reason: AdminFailure; message: string };

/**
 * Ends a role assignment, effective now.
 *
 * Revoked rather than deleted: an audit entry from last month names a role the
 * person genuinely held at the time, and deleting the row makes that entry
 * unreadable.
 */
export async function revokeRole(
  assignmentId: string,
  actor: AuditActor,
): Promise<RevokeOutcome> {
  const assignment = await prisma.roleAssignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true,
      userId: true,
      role: true,
      scopeType: true,
      scopeId: true,
      validTo: true,
      user: { select: { email: true } },
    },
  });
  if (!assignment) return { ok: false, reason: "USER_NOT_FOUND", message: "No such assignment." };

  // Already revoked: nothing to do, and reporting success is honest.
  if (assignment.validTo !== null && assignment.validTo <= new Date()) return { ok: true };

  if (assignment.role === Role.SUPER_ADMIN) {
    /*
      Refusing to remove the last super admin is not paternalism — it is the
      one mistake with no way back. Nobody left holding `role:assign` means
      nobody can grant it either, and the only remedy is editing the database
      by hand.
    */
    const remaining = await prisma.roleAssignment.count({
      where: {
        role: Role.SUPER_ADMIN,
        id: { not: assignment.id },
        validFrom: { lte: new Date() },
        OR: [{ validTo: null }, { validTo: { gt: new Date() } }],
        user: { status: UserStatus.ACTIVE },
      },
    });
    if (remaining === 0) {
      return {
        ok: false,
        reason: "LAST_SUPER_ADMIN",
        message:
          "This is the only super admin left. Grant the role to somebody else first, " +
          "or there will be nobody able to grant it at all.",
      };
    }
  }

  await prisma.roleAssignment.update({
    where: { id: assignment.id },
    data: { validTo: new Date() },
  });

  await recordAudit({
    actor,
    action: "user.role_revoked",
    entityType: "User",
    entityId: assignment.userId,
    before: {
      role: assignment.role,
      scopeType: assignment.scopeType,
      scopeId: assignment.scopeId,
    },
    metadata: { assignmentId: assignment.id, targetEmail: assignment.user.email },
  });

  log.info("role revoked", { userId: assignment.userId, role: assignment.role });
  return { ok: true };
}

export type StatusOutcome = { ok: true } | { ok: false; reason: AdminFailure; message: string };

/**
 * Suspends, terminates or reactivates an account.
 *
 * This is the offboarding switch, so it must be immediate. `sessionVersion` is
 * bumped on the way out — status is checked per request too, but bumping also
 * invalidates any half-finished MFA challenge and makes the intent explicit in
 * one place.
 */
export async function setUserStatus(
  userId: string,
  status: UserStatus,
  actor: AuditActor,
): Promise<StatusOutcome> {
  if (userId === actor.userId) {
    return {
      ok: false,
      reason: "SELF_ACTION_FORBIDDEN",
      message: "You cannot change your own account status.",
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, status: true },
  });
  if (!user) return { ok: false, reason: "USER_NOT_FOUND", message: "No such account." };
  if (user.status === status) return { ok: true };

  // Disabling the last super admin locks everyone out just as surely as
  // revoking the role does.
  if (status !== UserStatus.ACTIVE) {
    const remaining = await prisma.roleAssignment.count({
      where: {
        role: Role.SUPER_ADMIN,
        userId: { not: user.id },
        validFrom: { lte: new Date() },
        OR: [{ validTo: null }, { validTo: { gt: new Date() } }],
        user: { status: UserStatus.ACTIVE },
      },
    });
    const isSuperAdmin = await prisma.roleAssignment.count({
      where: {
        userId: user.id,
        role: Role.SUPER_ADMIN,
        validFrom: { lte: new Date() },
        OR: [{ validTo: null }, { validTo: { gt: new Date() } }],
      },
    });
    if (isSuperAdmin > 0 && remaining === 0) {
      return {
        ok: false,
        reason: "LAST_SUPER_ADMIN",
        message: "This is the only super admin left. Give somebody else the role first.",
      };
    }
  }

  await prisma.user.update({ where: { id: user.id }, data: { status } });
  await bumpSessionVersion(user.id);

  await recordAudit({
    actor,
    action: status === UserStatus.ACTIVE ? "user.reactivated" : "user.deactivated",
    entityType: "User",
    entityId: user.id,
    before: { status: user.status },
    after: { status },
    metadata: { targetEmail: user.email, sessionsEnded: true },
  });

  log.info("user status changed", { userId: user.id, from: user.status, to: status });
  return { ok: true };
}
