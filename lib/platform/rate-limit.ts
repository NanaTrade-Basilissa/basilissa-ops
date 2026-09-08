import "server-only";
import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/platform/prisma";
import { getEnv } from "@/lib/platform/env";
import { scoped } from "@/lib/platform/logger";

const log = scoped("rate-limit");

/**
 * Shared fixed-window rate limiter, layered so that only the last layer is
 * authoritative and every earlier one is a free optimisation:
 *
 *   1. Platform edge protection   Vercel today, Cloudflare if self-hosted.
 *                                 Outside this file entirely.
 *   2. Per-instance memory        Short-circuits keys this instance has
 *                                 already seen exceed the limit in the
 *                                 current window. Cannot produce a wrong
 *                                 answer (see `knownExceeded` below).
 *   3. Postgres counter           The actual limit. Shared across instances.
 *
 * Postgres rather than Redis is a deliberate decision, not an interim step —
 * see docs/architecture/decisions/0002-no-redis.md.
 *
 * PRIVACY — the reason `hashKey` exists
 * -------------------------------------
 * Callers pass identifying material (`feedback-submit:<ip>`). The previous
 * implementation kept that in memory only, which is what let the system claim
 * no IP address is ever written to the database. Persisting the counter would
 * have quietly broken that guarantee, so the key is HMAC'd here — inside the
 * limiter, where callers cannot forget to do it.
 *
 * It must be an HMAC and not a bare hash: the IPv4 space is ~4 billion
 * addresses, so an unkeyed digest is reversible by enumeration in minutes.
 */

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  /** Epoch millis at which the current window ends. */
  resetAt: number;
};

// --- Layer 2: per-instance short-circuit -----------------------------------

/**
 * Keys this instance has already observed over the limit, and when their
 * window ends. Safe by construction: a fixed-window count never decreases
 * within its window, so "already exceeded" cannot become "under the limit"
 * before `resetAt`. Losing this map costs a database round trip, nothing more.
 */
const knownExceeded = new Map<string, number>();

function sweep(now: number) {
  if (knownExceeded.size < 5_000) return;
  for (const [key, resetAt] of knownExceeded) {
    if (resetAt <= now) knownExceeded.delete(key);
  }
}

// --- Key derivation --------------------------------------------------------

let cachedSecret: Buffer | null = null;

function keySecret(): Buffer {
  cachedSecret ??= Buffer.from(getEnv().SESSION_SECRET, "utf8");
  return cachedSecret;
}

/**
 * Keyed, domain-separated digest of a caller's key. Truncated to 128 bits,
 * which is far beyond collision risk for this use and keeps the primary-key
 * index small.
 */
function hashKey(key: string): string {
  return createHmac("sha256", keySecret())
    .update(`ratelimit:v1:${key}`)
    .digest("hex")
    .slice(0, 32);
}

// --- Layer 3: authoritative Postgres counter -------------------------------

/** Roughly one request in a hundred also clears elapsed windows. */
const PURGE_PROBABILITY = 0.01;

async function purgeExpired(now: Date): Promise<void> {
  try {
    await prisma.rateLimitCounter.deleteMany({ where: { expiresAt: { lte: now } } });
  } catch (error) {
    // Housekeeping only — never allowed to affect the caller.
    log.error("purge failed", { error });
  }
}

/**
 * Consumes one unit against `key` and reports whether the caller is within
 * `limit` for the current `windowMs` window.
 *
 * FAILS OPEN. If the database is unreachable the request is allowed. Rate
 * limiting is abuse prevention, not correctness — failing closed would turn a
 * transient database blip into a total outage of the public feedback form,
 * which is a strictly worse failure. Layers 1 and 2 still apply.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  sweep(now);

  const hashed = hashKey(key);
  // Fixed window: every caller in the same window shares a bucket boundary,
  // so the row is deterministic without a read-modify-write.
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStartMs + windowMs;

  const shortCircuit = knownExceeded.get(hashed);
  if (shortCircuit !== undefined && shortCircuit > now) {
    return { success: false, limit, remaining: 0, resetAt: shortCircuit };
  }

  let count: number;
  try {
    // Single atomic round trip: INSERT ... ON CONFLICT DO UPDATE is what makes
    // concurrent requests across instances count correctly. A read-then-write
    // would race and undercount exactly when it matters most.
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "rate_limit_counters" ("key", "windowStart", "count", "expiresAt")
      VALUES (${hashed}, ${new Date(windowStartMs)}, 1, ${new Date(resetAt)})
      ON CONFLICT ("key", "windowStart")
      DO UPDATE SET "count" = "rate_limit_counters"."count" + 1
      RETURNING "count"
    `;
    count = rows[0]?.count ?? 1;
  } catch (error) {
    log.error("counter unavailable, allowing request", { error });
    return { success: true, limit, remaining: limit - 1, resetAt };
  }

  if (Math.random() < PURGE_PROBABILITY) {
    void purgeExpired(new Date(now));
  }

  if (count > limit) {
    knownExceeded.set(hashed, resetAt);
    return { success: false, limit, remaining: 0, resetAt };
  }

  return { success: true, limit, remaining: limit - count, resetAt };
}

/** Test seam: clears the per-instance layer so cases start from a clean slate. */
export function __resetInstanceCache(): void {
  knownExceeded.clear();
}

/**
 * Best-effort client IP from standard proxy headers. Works unchanged behind
 * Vercel, Railway, nginx or Caddy — deliberately no platform-specific helper.
 *
 * The value is only ever passed to `rateLimit`, which HMACs it before storage.
 */
export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
