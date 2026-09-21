import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/platform/env";
import { prisma } from "@/lib/platform/prisma";
import { scoped } from "@/lib/platform/logger";
import {
  MFA_PENDING_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  SESSION_REFRESH_THRESHOLD_MS,
  TRUSTED_DEVICE_COOKIE_NAME,
  TRUSTED_DEVICE_DURATION_MS,
} from "./constants";

/**
 * Sessions are a signed cookie *plus* a database row.
 *
 * The cookie is still a short JWT, and its signature is still what proves
 * authenticity — but it now carries only pointers (`sub`, `sid`, `sv`), not
 * user data. Every request resolves the real user from the database, which
 * buys three things a stateless token cannot:
 *
 *   - revocation. A terminated employee loses access on their next request,
 *     not whenever their token happens to expire.
 *   - freshness. A demotion takes effect immediately, because roles are read
 *     at check time rather than baked into a token at sign-in.
 *   - bulk invalidation, via `sessionVersion`, without hunting session rows.
 *
 * The cost is one indexed lookup per request. `verifySession` in dal.ts wraps
 * it in React `cache()`, so it happens once per request even when a layout and
 * its page both ask.
 */

export {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  SESSION_REFRESH_THRESHOLD_MS,
  MFA_PENDING_COOKIE_NAME,
  TRUSTED_DEVICE_COOKIE_NAME,
};

/** What the cookie carries. Pointers only — never roles, never a name. */
export type SessionToken = {
  userId: string;
  sessionId: string;
  sessionVersion: number;
};

function getSecretKey() {
  return new TextEncoder().encode(getEnv().SESSION_SECRET);
}

async function encrypt(payload: SessionToken, expiresAt: Date): Promise<string> {
  return new SignJWT({ sid: payload.sessionId, sv: payload.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getSecretKey());
}

/** Verify and decode a session cookie. Returns null on any failure. */
export async function decrypt(token: string | undefined): Promise<SessionToken | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    if (
      typeof payload.sub === "string" &&
      typeof payload.sid === "string" &&
      typeof payload.sv === "number"
    ) {
      return { userId: payload.sub, sessionId: payload.sid, sessionVersion: payload.sv };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Creates a session row and sets the cookie. Called only after credentials
 * have been verified.
 */
export async function createSession(userId: string, userAgent?: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessionVersion: true },
  });
  if (!user) throw new Error(`createSession called for unknown user ${userId}`);

  const session = await prisma.session.create({
    data: { userId, expiresAt, userAgent: userAgent?.slice(0, 512) },
    select: { id: true },
  });

  const token = await encrypt(
    { userId, sessionId: session.id, sessionVersion: user.sessionVersion },
    expiresAt,
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
    path: "/",
  });
}

export type ResolvedSession = {
  sessionId: string;
  user: {
    id: string;
    name: string;
    email: string;
    status: import("@prisma/client").UserStatus;
    assignments: {
      role: import("@prisma/client").Role;
      scopeType: import("@prisma/client").ScopeType;
      scopeId: string;
    }[];
    customRole?: {
      id: string;
      name: string;
      permissions: string[];
    } | null;
  };
};

export const API_SESSION_DURATION_MS = SESSION_DURATION_MS; // 7 days sliding window

/**
 * Creates an API session row and generates a signed Bearer token for external clients.
 * Valid for durationMs (defaults to 7 days sliding).
 */
export async function createApiSession(
  userId: string,
  userAgent?: string,
  durationMs: number = SESSION_DURATION_MS,
): Promise<{ token: string; expiresAt: Date; sessionId: string }> {
  const expiresAt = new Date(Date.now() + durationMs);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessionVersion: true },
  });
  if (!user) throw new Error(`createApiSession called for unknown user ${userId}`);

  const session = await prisma.session.create({
    data: { userId, expiresAt, userAgent: userAgent?.slice(0, 512) },
    select: { id: true },
  });

  const token = await encrypt(
    { userId, sessionId: session.id, sessionVersion: user.sessionVersion },
    expiresAt,
  );

  return { token, expiresAt, sessionId: session.id };
}

/**
 * Resolves a signed token string (from Bearer header or cookie) against the database.
 * Every rejection corresponds to a way a token can outlive the authority it was issued with.
 */
export async function resolveSessionFromToken(tokenString: string | undefined): Promise<ResolvedSession | null> {
  if (!tokenString) return null;
  const token = await decrypt(tokenString);
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { id: token.sessionId },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          sessionVersion: true,
          roleAssignments: {
            where: {
              validFrom: { lte: new Date() },
              OR: [{ validTo: null }, { validTo: { gt: new Date() } }],
            },
            select: { role: true, scopeType: true, scopeId: true },
          },
          customRole: {
            select: {
              id: true,
              name: true,
              permissions: {
                select: {
                  permission: {
                    select: { key: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!session) return null;
  // Signed for a different user than the row says — treat as forged.
  if (session.userId !== token.userId) return null;
  if (session.revokedAt !== null) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  // Issued before a password change, role change or termination.
  if (session.user.sessionVersion !== token.sessionVersion) return null;
  if (session.user.status !== "ACTIVE") return null;

  // Sliding window extension: if active and within the refresh threshold (remaining < 6 days out of 7),
  // extend session.expiresAt by SESSION_DURATION_MS (7 days) and update lastUsedAt.
  const timeRemainingMs = session.expiresAt.getTime() - Date.now();
  if (timeRemainingMs < SESSION_DURATION_MS - SESSION_REFRESH_THRESHOLD_MS) {
    const extendedExpiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    prisma.session
      .update({
        where: { id: session.id },
        data: { expiresAt: extendedExpiresAt, lastUsedAt: new Date() },
      })
      .catch((err) => scoped("session").warn("failed to extend sliding session in database", { err }));
  }

  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      status: session.user.status,
      assignments: session.user.roleAssignments,
      customRole: session.user.customRole
        ? {
            id: session.user.customRole.id,
            name: session.user.customRole.name,
            permissions: session.user.customRole.permissions.map((p) => p.permission.key),
          }
        : null,
    },
  };
}

/**
 * Public helper for API routes and external services to verify a Bearer token.
 */
export async function verifySessionToken(tokenString: string | undefined): Promise<ResolvedSession | null> {
  return resolveSessionFromToken(tokenString);
}

/**
 * Revokes a session row directly by ID.
 */
export async function revokeSessionById(sessionId: string): Promise<boolean> {
  const result = await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

/**
 * Reads the cookie and resolves it against the database.
 */
export async function getSession(): Promise<ResolvedSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return resolveSessionFromToken(token);
}

/** Revoke one session (sign out) and clear the cookie. */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = await decrypt(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (token) {
    // Best-effort: the cookie is cleared regardless, so a failure here can
    // never leave the user apparently signed in.
    await prisma.session
      .updateMany({
        where: { id: token.sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch((error) => scoped("identity").error("failed to revoke session", { error }));
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

/** Revoke every session for a user. Use on termination or forced sign-out. */
export async function revokeAllSessions(userId: string): Promise<number> {
  const { count } = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count;
}

/**
 * Invalidate every token for a user without touching session rows. Use
 * alongside a password change or a privilege change — it closes the window in
 * which an already-issued token still carries the old authority.
 */
export async function bumpSessionVersion(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
  });
}

// ---------------------------------------------------------------------------
// Half-finished sign-in
// ---------------------------------------------------------------------------

/**
 * Short, because it only has to survive someone reading a code off a phone.
 * A long-lived pending token is a password-only session in all but name.
 */
const MFA_PENDING_DURATION_MS = 5 * 60_000;

/**
 * Issues proof that the password step succeeded, and nothing more.
 *
 * Carries no session id and grants no access. `requireAuth` reads the session
 * cookie only, so a pending token cannot open a single page — which is the
 * point of keeping the two separate.
 */
export async function createMfaPendingToken(userId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + MFA_PENDING_DURATION_MS);

  const token = await new SignJWT({ pending: true })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getSecretKey());

  const cookieStore = await cookies();
  cookieStore.set(MFA_PENDING_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

/** The user id from a valid pending token, or null. */
export async function readMfaPendingUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(MFA_PENDING_COOKIE_NAME)?.value;
  if (!raw) return null;

  try {
    const { payload } = await jwtVerify(raw, getSecretKey(), { algorithms: ["HS256"] });
    return payload.pending === true && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function clearMfaPendingToken(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(MFA_PENDING_COOKIE_NAME);
}

// ---------------------------------------------------------------------------
// Trusted Devices (30-day MFA bypass)
// ---------------------------------------------------------------------------

/**
 * Issues a signed cookie marking the current device as trusted for 30 days.
 * Includes user.sessionVersion so that a password reset or session revocation
 * automatically invalidates all trusted devices for that user.
 */
export async function trustDevice(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessionVersion: true },
  });
  if (!user) return;

  const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_DURATION_MS);
  const token = await new SignJWT({ trustedDevice: true, sv: user.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getSecretKey());

  const cookieStore = await cookies();
  cookieStore.set(TRUSTED_DEVICE_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

/**
 * Checks whether the current request presents a valid trusted device cookie
 * for the given userId and current sessionVersion.
 */
export async function isDeviceTrusted(userId: string): Promise<boolean> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(TRUSTED_DEVICE_COOKIE_NAME)?.value;
  if (!raw) return false;

  try {
    const { payload } = await jwtVerify(raw, getSecretKey(), { algorithms: ["HS256"] });
    if (
      payload.trustedDevice !== true ||
      payload.sub !== userId ||
      typeof payload.sv !== "number"
    ) {
      return false;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { sessionVersion: true, status: true },
    });
    if (!user || user.status !== "ACTIVE" || user.sessionVersion !== payload.sv) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
