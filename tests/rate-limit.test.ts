import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The limiter is layered (see lib/platform/rate-limit.ts): an in-instance
 * short-circuit in front of an authoritative Postgres counter. These tests
 * stand in for Postgres with a map keyed the same way the real table is, so
 * the counting semantics — and the privacy guarantee about what reaches the
 * table — are exercised without a database.
 */
const store = vi.hoisted(() => ({
  rows: new Map<string, number>(),
  /** Every key value the limiter has tried to persist, for the privacy check. */
  persistedKeys: [] as string[],
  failNext: false,
  deleted: 0,
}));

vi.mock("@/lib/platform/prisma", () => ({
  prisma: {
    // The limiter calls $queryRaw as a tagged template:
    //   $queryRaw`INSERT ... VALUES (${key}, ${windowStart}, 1, ${expiresAt}) ...`
    // so the interpolated values arrive as trailing arguments.
    $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      if (store.failNext) {
        store.failNext = false;
        throw new Error("connection refused");
      }
      const [key, windowStart] = values as [string, Date];
      store.persistedKeys.push(key);
      const id = `${key}@${windowStart.getTime()}`;
      const next = (store.rows.get(id) ?? 0) + 1;
      store.rows.set(id, next);
      return [{ count: next }];
    },
    rateLimitCounter: {
      deleteMany: async () => {
        store.deleted += 1;
        return { count: 0 };
      },
    },
  },
}));

const { rateLimit, __resetInstanceCache, getClientIp } = await import("@/lib/platform/rate-limit");

beforeEach(() => {
  store.rows.clear();
  store.persistedKeys.length = 0;
  store.failNext = false;
  store.deleted = 0;
  __resetInstanceCache();
});

describe("rateLimit", () => {
  it("allows requests up to the limit and blocks beyond it", async () => {
    const key = `k-${crypto.randomUUID()}`;

    for (let i = 0; i < 3; i++) {
      const result = await rateLimit(key, 3, 60_000);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(3 - (i + 1));
    }

    const blocked = await rateLimit(key, 3, 60_000);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("tracks keys independently", async () => {
    const keyA = `a-${crypto.randomUUID()}`;
    const keyB = `b-${crypto.randomUUID()}`;

    expect((await rateLimit(keyA, 1, 60_000)).success).toBe(true);
    expect((await rateLimit(keyA, 1, 60_000)).success).toBe(false);
    expect((await rateLimit(keyB, 1, 60_000)).success).toBe(true);
  });

  it("starts a fresh window once the previous one elapses", async () => {
    const key = `w-${crypto.randomUUID()}`;
    const windowMs = 60_000;

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(windowMs * 100));
      expect((await rateLimit(key, 1, windowMs)).success).toBe(true);
      expect((await rateLimit(key, 1, windowMs)).success).toBe(false);

      // Next fixed window: a different row, and the in-instance
      // short-circuit must not carry the block across the boundary.
      vi.setSystemTime(new Date(windowMs * 101));
      expect((await rateLimit(key, 1, windowMs)).success).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports resetAt at the end of the current fixed window", async () => {
    const windowMs = 60_000;
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(windowMs * 10 + 1234));
      const result = await rateLimit(`r-${crypto.randomUUID()}`, 5, windowMs);
      expect(result.resetAt).toBe(windowMs * 11);
    } finally {
      vi.useRealTimers();
    }
  });

  // The system's stated privacy guarantee is that no IP address is ever
  // written to the database. Moving the counter out of memory is exactly
  // where that could regress silently, so it is asserted rather than assumed.
  it("never persists the caller's raw key, and hides the IP inside it", async () => {
    const ip = "196.61.35.204";
    await rateLimit(`feedback-submit:${ip}`, 5, 60_000);

    expect(store.persistedKeys).toHaveLength(1);
    const persisted = store.persistedKeys[0]!;

    expect(persisted).not.toContain(ip);
    expect(persisted).not.toContain("feedback-submit");
    expect(persisted).toMatch(/^[0-9a-f]{32}$/);
  });

  it("maps different callers to different stored keys", async () => {
    await rateLimit("feedback-submit:10.0.0.1", 5, 60_000);
    await rateLimit("feedback-submit:10.0.0.2", 5, 60_000);

    expect(new Set(store.persistedKeys).size).toBe(2);
  });

  // Rate limiting is abuse prevention, not correctness. Failing closed would
  // turn a transient database blip into an outage of the public feedback form.
  it("fails open when the counter is unreachable", async () => {
    store.failNext = true;
    const result = await rateLimit(`f-${crypto.randomUUID()}`, 1, 60_000);

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("short-circuits an already-exceeded key without touching the counter", async () => {
    const key = `s-${crypto.randomUUID()}`;
    await rateLimit(key, 1, 60_000);
    await rateLimit(key, 1, 60_000); // exceeds, caches the block

    const writesBefore = store.persistedKeys.length;
    const blocked = await rateLimit(key, 1, 60_000);

    expect(blocked.success).toBe(false);
    expect(store.persistedKeys.length).toBe(writesBefore);
  });
});

describe("getClientIp", () => {
  function requestWith(headers: Record<string, string>) {
    return { headers: new Headers(headers) } as unknown as Parameters<typeof getClientIp>[0];
  }

  it("prefers the first x-forwarded-for entry", () => {
    expect(getClientIp(requestWith({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    expect(getClientIp(requestWith({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("returns a stable placeholder when no proxy header is present", () => {
    expect(getClientIp(requestWith({}))).toBe("unknown");
  });
});
