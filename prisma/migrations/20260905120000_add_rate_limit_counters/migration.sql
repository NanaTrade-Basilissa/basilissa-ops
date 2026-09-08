-- Authoritative, shared fixed-window rate-limit counters.
--
-- Replaces the process-local in-memory Map in lib/platform/rate-limit.ts,
-- which stopped being effective the moment the app ran on more than one
-- instance (each serverless isolate had its own counters).
--
-- Postgres rather than Redis: see docs/architecture/decisions/0002-no-redis.md.
--
-- PRIVACY: "key" never contains a raw IP address. The application HMACs the
-- caller-supplied key before it reaches this table, preserving the system's
-- guarantee that no IP is persisted. Plain hashing would not be enough — the
-- IPv4 space is small enough to enumerate — so the digest is keyed.
CREATE TABLE "rate_limit_counters" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("key","windowStart")
);

-- Supports the opportunistic purge of elapsed windows.
CREATE INDEX "rate_limit_counters_expiresAt_idx" ON "rate_limit_counters"("expiresAt");
