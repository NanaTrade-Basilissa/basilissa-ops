# ADR 0001 — Runtime topology and infrastructure portability

- **Status:** Accepted
- **Date:** 2026-09-05 (revised same day to add the portability constraints in §2;
  revised 2026-09-07 to record the worker host)
- **Resolves:** U15 in the [Implementation Plan](../implementation-plan.md)
- **Gates:** Phase 0 worker foundation, Phase 0 rate-limit fix, Phase 4 Odoo sync
- **Related:** [ADR 0002 — No Redis](./0002-no-redis.md)

## Context

The feedback system currently deploys two ways: the in-repo Docker/Compose
stack, and Vercel (commit `67481f5` added the RHEL Prisma target and disabled
`output: "standalone"` under `VERCEL`). Production runs on **Vercel + Neon**.

The Operations Platform needs a **continuously running process** that Vercel's
request-scoped functions cannot host: attendance day projection and
re-settlement, nightly auto-close of missing clock-outs, device health and
clock-drift probes, the Odoo outbox drain, and nightly reconciliation.

Separately, the business has stated that **the current hosting is not a
permanent commitment**. Backend infrastructure may move to Railway, a
company-owned server, or another Docker-compatible environment.

## Decision

Two decisions, and the second constrains the first.

### 1. Topology

**Keep Vercel for the web application and API. Run the worker as a separate
long-running service on Railway**, deployed from this same repository and the
same Docker image as `app`, sharing the domain modules under `lib/modules/`.
Both connect to the same managed Postgres (Neon).

Railway builds directly from the repo's `Dockerfile` — no second Dockerfile,
no build target to select. Which role a container plays is `PROCESS_ROLE`
(`docker/start.sh`), not a different start command: most platforms' "custom
start command" overrides `CMD`, not a hardcoded `ENTRYPOINT` like this image
has, so a start command handed to Railway risks landing as arguments *to*
`start.sh` rather than replacing it. Branching inside the script instead needs
nothing from the platform beyond one environment variable, and works
identically on Railway, Fly, ECS, or a plain `docker run` — see
`docker-compose.yml`'s `worker` service for the reference wiring.

The Railway worker service needs no public domain and no exposed port — it
serves no HTTP. Set `DATABASE_URL` (same Neon connection string as Vercel),
`SESSION_SECRET` (must match Vercel's — see §2's "single source of truth"
follow-up), `PROCESS_ROLE=worker`, and `WORKER_POLL_INTERVAL_MS` (§E3 in the
decision register covers what to tune this against). It must **not** run
`prisma migrate deploy` — exactly one process should ever apply migrations,
and that stays the app's job (`start.sh` only runs it for the non-worker
role), never something either platform triggers automatically.

### 2. Vercel and Neon are the *current deployment*, not an architectural dependency

The following are **binding constraints**, not preferences:

- **No Vercel-specific APIs or packages in business or domain logic.** No
  `@vercel/*` dependency, no `geolocation()`, `ipAddress()`, `waitUntil()`.
  Platform detection is confined to build configuration.
- **No Neon-specific functionality.** Postgres is treated as Postgres, reached
  through Prisma and a plain `DATABASE_URL`. No `@neondatabase/serverless`, no
  `@prisma/adapter-neon`, no `driverAdapters`.
- **Containerisation stays working.** The Dockerfile and `docker-compose.yml`
  are maintained and verified, not left to rot.
- **No decision may make relocating the API, worker, or database
  unnecessarily difficult.**

The long-term shape this preserves:

```
Vercel                    Railway / company server
└── Next.js web app       ├── Backend / API
                          ├── Background worker
                          └── PostgreSQL (possible future move)
```

**Nothing moves now.** The goal is portability, not migration.

### Banned couplings (decided in advance, so they are never accidentally introduced)

| Tempting | Use instead | Why |
| --- | --- | --- |
| Vercel Blob (Phase 5/6 photos, capture frames) | **S3-compatible API** — R2, S3, MinIO | Same SDK, swap an endpoint. Vercel Blob does not exist on Railway |
| Vercel Cron | **The worker's own scheduler** | Vercel Cron does not exist off Vercel |
| `@prisma/adapter-neon`, `@neondatabase/serverless` | **Plain Prisma**; pooling config in `lib/platform/prisma.ts` | Welds the app to Neon to solve a connection-limit problem that has a portable fix |
| Redis for nonces / rate limits / queues / locks | **Postgres** | See [ADR 0002](./0002-no-redis.md) |

## Consequences

### Accepted costs

1. **Two platforms to operate.** Deploys, secrets, logs and alerting exist in
   two places. Environment variables must stay in sync; a drifted
   `DATABASE_URL` or `SESSION_SECRET` between them is a silent failure mode.
2. **The rate-limit fix is no longer deferrable.** `lib/platform/rate-limit.ts`
   keeps state in a process-local `Map`. Vercel invocations may each get a
   fresh isolate, so the limiter is currently close to a no-op in production —
   a live bug on a public endpoint, not a future concern. Phase 0 replaces it
   with the layered design in ADR 0002.
3. **No long-lived connections from the web tier.** Anything holding a socket —
   notably device polling — lives in the worker, never in a route handler.
4. **Cold starts on the web tier.** Acceptable for admin and API traffic;
   re-check against the clock-in latency budget in Phase 5.

### Cost consequence — the worker changes the Neon billing profile

Neon autosuspends idle compute. **A worker polling Postgres prevents that
permanently**, moving billing from bursty to always-on (~730 compute-hours per
month). Two implications:

- **Poll interval is a cost parameter, not just a latency one.** Attendance
  settlement tolerates 60s or several minutes. There is no reason to poll at
  30s. Default to the longest interval the requirement allows.
- Once always-on Postgres is being paid for regardless, the cost case that
  favoured Neon over Railway Postgres weakens. **Re-run the numbers before the
  worker ships**, against the actual Neon plan — not against an estimate.

### Migration work this defers (known, bounded, not blocking)

- **Connection pooling.** Neon's pooler is provided today. Railway or
  self-hosted would need PgBouncer or a connection cap. Confined to
  `lib/platform/prisma.ts` — one file.
- **Migration ownership.** With a web tier and a worker, exactly one must run
  `prisma migrate deploy`. Decide when the worker lands.

### Deferred, not closed

**If the fingerprint investigation (U1/U2) lands on Scenario B** — terminals
reachable only on the branch LAN, requiring the server to poll them — the
worker must reach each branch network. That likely means an on-prem branch
agent per site, and possibly revisiting this ADR in favour of containers.
Re-evaluate when U1 and U2 are answered, before Phase 2 Stage 2b.

## Enforcement

Portability that is never exercised rots silently: the container build breaks,
nobody notices, and the cost lands on migration day. Therefore:

- **CI builds the Docker image on every pull request.** A broken container
  build fails the build, the same as a broken test.
- The banned-couplings table above is reviewed when any new dependency is added.

## Not chosen

- **Docker containers for everything.** Fewer moving parts, one deploy target,
  and the compose stack already works. Rejected because production is already
  on Vercel and moving the web tier is churn this programme does not need now.
  The Dockerfile and compose files remain maintained and CI-verified — they are
  the fallback if the Scenario B trigger fires.
- **Vercel only, worker deferred.** Rejected: Phase 1 cannot settle an
  attendance day and Phase 4 cannot exist. Building toward a wall.

## Follow-up

- [x] Choose the worker host and record it here. — Railway, §1 above.
- [ ] Single source of truth for env vars across both platforms. Still manual:
      `DATABASE_URL` and `SESSION_SECRET` must be copied to Railway by hand
      and kept in sync with Vercel's values whenever either changes.
- [ ] Replace the in-memory rate limiter (Phase 0, per ADR 0002).
- [ ] Health/alerting for the worker — a silently dead worker means attendance
      days stop settling, which is invisible until payroll.
- [ ] Re-run Neon vs Railway Postgres costs before the worker ships. Still
      open — Railway hosts the worker process only here, not Postgres itself.
