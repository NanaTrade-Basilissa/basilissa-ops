import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { open, seal } from "@/lib/platform/secret-box";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/platform/totp";
import { recordAudit, recordAuditBestEffort, type AuditActor } from "@/lib/platform/audit";
import { scoped } from "@/lib/platform/logger";
import { APP_NAME } from "@/lib/platform/constants";
import { bumpSessionVersion } from "./session";
import { MFA_RECOMMENDED_ROLES, MFA_REQUIRED_ROLES } from "./constants";

const log = scoped("identity.mfa");
const SEAL_PURPOSE = "mfa-totp";

export { MFA_RECOMMENDED_ROLES, MFA_REQUIRED_ROLES };

export function requiresMfa(roles: readonly Role[]): boolean {
  return roles.some((role) => MFA_REQUIRED_ROLES.includes(role));
}

export function recommendsMfa(roles: readonly Role[]): boolean {
  return roles.some((role) => MFA_RECOMMENDED_ROLES.includes(role));
}

const RECOVERY_CODE_COUNT = 10;

/** Hex, hyphenated for legibility when someone writes it on paper. */
function generateRecoveryCode(): string {
  const raw = randomBytes(5).toString("hex").toUpperCase();
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/**
 * SHA-256, not bcrypt.
 *
 * Recovery codes are 40 bits of uniform randomness that we generated, not
 * human-chosen passwords, so there is no dictionary to attack and no benefit
 * from a slow hash. What matters is that a dump of this table is not directly
 * usable, and that comparison is constant-time.
 */
function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code.replace(/[\s-]/g, "").toUpperCase()).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export type MfaEnrolment = {
  /** Shown once, so it can be typed into an app that cannot scan. */
  secret: string;
  /** otpauth:// URI for the QR code. */
  uri: string;
};

/**
 * Starts enrolment: generates a secret and stores it sealed, but leaves MFA
 * disabled until a code proves the authenticator actually works. Storing a
 * secret is not the same as having working MFA, and conflating them locks
 * people out of a setup they never finished.
 */
export async function beginMfaEnrolment(
  userId: string,
  email: string,
): Promise<MfaEnrolment> {
  const secret = generateTotpSecret();

  await prisma.user.update({
    where: { id: userId },
    data: { mfaSecret: seal(secret, SEAL_PURPOSE), mfaEnabledAt: null },
  });

  return { secret, uri: totpUri(secret, email, APP_NAME) };
}

export type ConfirmResult =
  | { ok: true; recoveryCodes: string[] }
  | { ok: false; reason: "NO_ENROLMENT_IN_PROGRESS" | "INVALID_CODE" };

/**
 * Completes enrolment once a code verifies, and issues recovery codes.
 *
 * Bumps `sessionVersion`: enrolling changes what authentication means for this
 * account, so every session issued under the old rules ends.
 */
export async function confirmMfaEnrolment(
  userId: string,
  code: string,
  actor: AuditActor,
): Promise<ConfirmResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaSecret: true },
  });

  if (!user?.mfaSecret) return { ok: false, reason: "NO_ENROLMENT_IN_PROGRESS" };

  const secret = open(user.mfaSecret, SEAL_PURPOSE);
  if (!verifyTotp(secret, code)) return { ok: false, reason: "INVALID_CODE" };

  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { mfaEnabledAt: new Date() } });

    // Replace rather than append: re-enrolling must invalidate the codes
    // printed for the previous authenticator.
    await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
    await tx.mfaRecoveryCode.createMany({
      data: codes.map((value) => ({ userId, codeHash: hashRecoveryCode(value) })),
    });

    await recordAudit(
      {
        actor,
        action: "user.mfa_enabled",
        entityType: "User",
        entityId: userId,
        metadata: { recoveryCodesIssued: codes.length },
      },
      tx,
    );
  });

  await bumpSessionVersion(userId);
  log.info("mfa enabled", { userId });

  return { ok: true, recoveryCodes: codes };
}

export type MfaChallengeResult =
  | { ok: true; usedRecoveryCode: boolean }
  | { ok: false; reason: "NOT_ENROLLED" | "INVALID_CODE" };

/**
 * Verifies a second factor at sign-in.
 *
 * A recovery code is accepted in place of a TOTP code and consumed on use —
 * marked, not deleted, so "a recovery code was used at 03:00" remains visible
 * to anyone reviewing the account later.
 */
export async function verifyMfaChallenge(
  userId: string,
  code: string,
  actor: AuditActor,
): Promise<MfaChallengeResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaSecret: true, mfaEnabledAt: true },
  });

  if (!user?.mfaSecret || !user.mfaEnabledAt) return { ok: false, reason: "NOT_ENROLLED" };

  if (verifyTotp(open(user.mfaSecret, SEAL_PURPOSE), code)) {
    return { ok: true, usedRecoveryCode: false };
  }

  const candidateHash = hashRecoveryCode(code);
  const unused = await prisma.mfaRecoveryCode.findMany({
    where: { userId, usedAt: null },
    select: { id: true, codeHash: true },
  });

  const match = unused.find((row) => safeEqualHex(row.codeHash, candidateHash));
  if (!match) {
    await recordAuditBestEffort({
      actor,
      action: "user.mfa_failed",
      entityType: "User",
      entityId: userId,
    });
    return { ok: false, reason: "INVALID_CODE" };
  }

  await prisma.mfaRecoveryCode.update({
    where: { id: match.id },
    data: { usedAt: new Date() },
  });

  // Worth noticing: a recovery code being used usually means someone lost a
  // device, and occasionally means someone else has their codes.
  await recordAuditBestEffort({
    actor,
    action: "user.mfa_recovery_code_used",
    entityType: "User",
    entityId: userId,
    metadata: { remaining: unused.length - 1 },
  });
  log.warn("recovery code used", { userId, remaining: unused.length - 1 });

  return { ok: true, usedRecoveryCode: true };
}

/** Whether this account currently has working MFA. */
export async function hasMfaEnabled(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaEnabledAt: true },
  });
  return user?.mfaEnabledAt !== null && user?.mfaEnabledAt !== undefined;
}

/** Unused recovery codes remaining, for warning someone they are running out. */
export async function remainingRecoveryCodes(userId: string): Promise<number> {
  return prisma.mfaRecoveryCode.count({ where: { userId, usedAt: null } });
}

export type MfaResetResult =
  | { ok: true }
  | { ok: false; reason: "SELF_RESET_FORBIDDEN" | "NOT_ENROLLED" };

/**
 * Clears someone's second factor so they can enrol again.
 *
 * Exists because the alternative is a SQL update, and "lost the phone and the
 * recovery codes" is an ordinary Tuesday rather than an exotic failure. Making
 * it a permissioned, audited action is the difference between a support task
 * and an untraceable one.
 *
 * Refuses self-reset. Someone who has a live session but no longer holds the
 * second factor could otherwise remove it themselves, which is the exact
 * situation — a stolen session — that MFA is there to survive. They ask
 * somebody else, which is the point.
 */
export async function resetMfa(
  targetUserId: string,
  actor: AuditActor,
): Promise<MfaResetResult> {
  if (actor.userId === targetUserId) return { ok: false, reason: "SELF_RESET_FORBIDDEN" };

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { mfaEnabledAt: true, mfaSecret: true },
  });
  if (!user?.mfaSecret && !user?.mfaEnabledAt) return { ok: false, reason: "NOT_ENROLLED" };

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetUserId },
      data: { mfaSecret: null, mfaEnabledAt: null },
    });
    await tx.mfaRecoveryCode.deleteMany({ where: { userId: targetUserId } });

    await recordAudit(
      {
        actor,
        // Its own action rather than a generic user.updated: removing
        // somebody's second factor is exactly the entry a security review
        // looks for.
        action: "user.mfa_reset",
        entityType: "User",
        entityId: targetUserId,
      },
      tx,
    );
  });

  // Every session issued while the factor existed ends, so a reset cannot be
  // used to keep an already-open session alive without it.
  await bumpSessionVersion(targetUserId);
  log.warn("mfa reset by an administrator", { targetUserId, by: actor.userId });

  return { ok: true };
}
