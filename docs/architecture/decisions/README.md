# Architecture decision records

Short, dated records of decisions that constrain later work. An ADR is written
when a choice would otherwise have to be re-litigated, or when the reasoning
would be invisible from the code alone.

| # | Decision | Status |
| --- | --- | --- |
| [0001](./0001-runtime-topology.md) | Runtime topology and infrastructure portability — Vercel web + separate worker; Vercel/Neon are the current deployment, not an architectural dependency | Accepted |
| [0002](./0002-no-redis.md) | No Redis. Postgres serves queues, locks, sessions, rate limits and nonces | Accepted |

See also [Open Decisions & Provisional Values](../open-decisions.md) — the
register of placeholders, deferrals and gaps that are *not yet* decisions.
An ADR records what was chosen; that document records what has not been.

## Writing one

Keep it short. State the context, the decision, and the consequences you are
accepting — including the costs. Record what you did **not** choose and why;
that is usually the part someone needs six months later.

For any proposal that adds an infrastructure dependency, answer all five:

1. What problem does it solve?
2. Why can't PostgreSQL (or the app runtime, or an existing component) solve it?
3. Is it required for correctness, or is it an optimisation?
4. What happens when it is unavailable?
5. What operational cost and complexity does it add?

The default answer to new infrastructure is no.
