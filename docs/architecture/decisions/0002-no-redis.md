# ADR 0002 — No Redis

- **Status:** Accepted
- **Date:** 2026-09-05
- **Supersedes:** the "Redis enters at Phase 5" line in the original
  [Implementation Plan](../implementation-plan.md), and item D7 in the
  [Architecture Assessment](../attendance-platform.md)
- **Related:** [ADR 0001 — Runtime topology and portability](./0001-runtime-topology.md)

## Context

Revision 2 of the architecture assessment deferred Redis to Phase 5 for
clock-in nonces and distributed rate limiting. That deferral was re-examined
against two standing constraints:

1. **Core attendance must keep working when optional infrastructure is
   unavailable.** Postgres is the authoritative source of attendance data.
2. **Infrastructure cost is real.** This is a production system for a real
   company. Every dependency needs a justification, not a precedent.

Re-examination found the earlier plan was **not merely premature — it was
wrong**. A Redis-backed nonce store makes Redis a *correctness* dependency of
clock-in, which directly violates constraint 1.

## Decision

**Redis is not part of this architecture.** Not deferred — removed.

Re-introducing it requires a new ADR answering the five questions below with a
concrete requirement that Postgres genuinely cannot serve.

## Analysis

Every use previously proposed, against the five required questions:

| Use | Why not Postgres? | Correctness or optimisation? | If Redis were down | Verdict |
| --- | --- | --- | --- | --- |
| **Clock-in nonces** | No reason. Single-use consumption is `UPDATE … WHERE consumed_at IS NULL RETURNING` — atomic by definition | **Correctness** | **Clock-in fails** | Postgres |
| **Rate limiting** | No reason. Indexed upsert on `(key, window_start)`; thousands/day at this scale | Abuse prevention | Fail open or fail closed; both bad | Postgres |
| **Job queue** | No reason. `SELECT … FOR UPDATE SKIP LOCKED` is the established pattern; hundreds of jobs/day | Correctness | Attendance days stop settling | Postgres |
| **Sessions** | No reason. Revocation requires a durable table regardless | Correctness | Everyone logged out | Postgres |
| **Distributed locks** | No reason. `pg_advisory_lock` exists and is well suited | Correctness | Worker contention | Postgres |
| **Caching** | No identified need. Dashboards are `force-dynamic` | Optimisation | Nothing | Not needed |

### The nonce case decides it

In Postgres, the nonce is consumed **in the same transaction as the attendance
event insert**. In Redis it cannot be — you get a two-system commit on the most
correctness-critical path in the product, with no way to make the pair atomic.

Postgres is not the compromise here. It is the better design.

### Operational cost of adding Redis

A managed Redis instance, its credentials in two deploy targets, its
availability in the attendance path, its failure modes, its eviction policy,
and its backup story — to replace mechanisms Postgres already provides
correctly. The complexity is not free and buys nothing measurable at this
scale.

## The one legitimate concern, and its portable answer

The honest argument for Redis is write volume: rate limiting writes to Postgres
on *every* limited request, including during an abuse burst, which is exactly
when the database is least able to absorb it.

The answer is a layered design, not a new datastore. Each layer is portable and
independently optional:

```
1  Platform edge protection    Vercel today · Cloudflare if self-hosted    free, portable
2  Per-instance in-memory      short-circuits keys already over limit      free, no correctness role
3  Postgres counter            authoritative, shared, durable              the actual limit
```

Layer 2 is what `lib/platform/rate-limit.ts` already is. It stops being *the*
limiter and becomes a free pre-filter in front of layer 3. Losing layer 1 or 2
degrades efficiency; only layer 3 is authoritative, and it lives in the
database that is already a hard dependency.

## Consequences

- `lib/platform/rate-limit.ts` gains a Postgres-backed authoritative layer in
  Phase 0. Its interface does not change.
- Phase 5 nonces are a Postgres table, consumed transactionally alongside the
  attendance event.
- The job runner and outbox are Postgres-backed, as already planned.
- **No new infrastructure dependency in any phase of the roadmap.**
- The stale comment in `lib/platform/rate-limit.ts` recommending
  `@upstash/ratelimit` is removed — it now contradicts a standing decision.

## Revisit if

- Rate-limit write volume is *measured* to be a real problem after layers 1
  and 2 are in place — measured, not anticipated.
- A requirement appears with genuine sub-millisecond latency needs that
  Postgres demonstrably cannot meet.

In either case: new ADR, five questions, evidence.
