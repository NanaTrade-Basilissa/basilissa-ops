import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/platform/prisma";
import { recordAuditBestEffort } from "@/lib/platform/audit";
import { scoped } from "@/lib/platform/logger";
import { bumpSessionVersion } from "./session";
import { RESET_TOKEN_TTL_MS } from "./constants";

const log = scoped("identity.password-reset");

/** Work factor, matching the seed and the rest of the app. */
const BCRYPT_ROUNDS = 12;

/**
 * 256 bits. The token is a bearer credential for one account — briefly as good
 * as the password — so it is generated the way a session secret would be and
 * never derived from anything guessable.
 */
function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Stored hashed, for the same reason passwords are: a database dump must not
 * yield working links.
 *
 * Plain SHA-256 rather than bcrypt, deliberately. Bcrypt's cost exists to slow
 * brute force against low-entropy secrets that humans chose; this is 256 random
 * bits, where brute force is not the threat and a slow hash would only stop the
 * lookup being a single indexed read.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Internal signal for the concurrent-redemption race. Caught, never returned. */
class TokenAlreadySpent extends Error {
  override readonly name = "TokenAlreadySpent";
}

/**
 * Why a link was issued. The mechanism is identical — a single-use token — but
 * an email telling a new colleague that "someone asked to reset your password"
 * is confusing enough that they may well ignore it.
 */
export type ResetPurpose = "RESET" | "INVITE";

export type IssuedReset = { token: string; expiresAt: Date };

/**
 * Issues a reset link for an address, if it belongs to an account that can use
 * one.
 *
 * Returns null when it does not, and THE CALLER MUST NOT LET THAT SHOW.
 * Answering "no such account" turns this form into a way to test which
 * addresses are real, which matters more than usual here because the addresses
 * are staff names at a known employer.
 */
export async function issuePasswordReset(
  email: string,
  purpose: ResetPurpose = "RESET",
): Promise<IssuedReset | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, status: true },
  });

  // Suspended and terminated accounts get no link. Password recovery is not a
  // route back in for someone whose access was deliberately removed.
  if (!user || user.status !== "ACTIVE") {
    log.info("reset requested for an address that cannot receive one", {
      known: user !== null,
      status: user?.status ?? null,
    });
    return null;
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await prisma.$transaction(async (tx) => {
    // Supersede any outstanding link. Two live links means the older one still
    // works after the newer is used, and "request another" is exactly what
    // someone does when they suspect the first was intercepted.
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    await tx.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
    });
  });

  await recordAuditBestEffort({
    actor: { userId: null, email: null, role: null },
    action: purpose === "INVITE" ? "user.invited" : "user.password_reset_requested",
    entityType: "User",
    entityId: user.id,
    metadata: { purpose, expiresAt: expiresAt.toISOString() },
  });

  return { token, expiresAt };
}

export type ResetOutcome =
  | { ok: true; userId: string }
  | { ok: false; reason: "INVALID_OR_EXPIRED" };

/**
 * Spends a reset link and sets the new password.
 *
 * Every rejection returns the same reason. Unknown, already used, expired and
 * belonging-to-a-disabled-account are one answer to whoever holds the link,
 * because distinguishing them tells an attacker which guess was closest.
 *
 * Does NOT sign anyone in. They go to the sign-in form, which means a second
 * factor is still demanded of an account that has one — otherwise access to an
 * inbox would be enough to walk past MFA entirely.
 */
export async function completePasswordReset(
  token: string,
  newPassword: string,
): Promise<ResetOutcome> {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { status: true } },
    },
  });

  const usable =
    record !== null &&
    record.usedAt === null &&
    record.expiresAt > new Date() &&
    record.user.status === "ACTIVE";

  if (!usable) return { ok: false, reason: "INVALID_OR_EXPIRED" };

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  try {
    await prisma.$transaction(async (tx) => {
      /*
        Spend the token by id AND usedAt, so two requests arriving together
        cannot both succeed: the second updates zero rows. Without it a
        double-submitted link sets the password twice, which is harmless, and
        writes two audit entries describing two separate resets, which is not.
      */
      const spent = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (spent.count === 0) throw new TokenAlreadySpent();

      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, passwordChangedAt: new Date() },
      });

      // Anything else outstanding for this account dies with it.
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
    });
  } catch (error) {
    // Lost the race with a concurrent redemption. The other request set the
    // password; this link is spent, which is the same answer the holder gets
    // for any other unusable link.
    if (error instanceof TokenAlreadySpent) return { ok: false, reason: "INVALID_OR_EXPIRED" };
    throw error;
  }

  /*
    Every existing session ends. If the reset happened because somebody else
    had the password, leaving their session alive means the reset accomplished
    nothing — and the person resetting has no way to know whether that is the
    situation they are in.
  */
  await bumpSessionVersion(record.userId);

  await recordAuditBestEffort({
    actor: { userId: record.userId, email: null, role: null },
    action: "user.password_reset",
    entityType: "User",
    entityId: record.userId,
    metadata: { tokenId: record.id, sessionsEnded: true },
  });

  log.info("password reset completed", { userId: record.userId });
  return { ok: true, userId: record.userId };
}

