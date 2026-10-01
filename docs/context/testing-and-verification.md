# Testing and verification

Passing tests are necessary and, for some kinds of change, nowhere near
sufficient. This page says which evidence a change needs.

## The gates

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

All four, to completion, before every commit. CI runs the same four, then builds
the container.

**Check real exit codes.** Piping a gate through `tail` or `grep` gives you the
exit status of `tail`, not of the gate. That is how a commit with failing lint got
merged here once. Run each gate unpiped, or use `set -o pipefail`, or print
`$?` immediately after.

| Gate | Command | Notes |
| --- | --- | --- |
| Lint | `pnpm lint` | Includes the module-boundary rules. A boundary failure means an import went through a private file. |
| Types | `pnpm typecheck` | `tsc --noEmit`. Needs `prisma generate` (done by `postinstall`). |
| Tests | `pnpm test` | `vitest run`. `pnpm test:watch` while working. |
| Build | `pnpm build` | Plain `next build`. Needs no secrets: env is validated lazily. |

## What the unit tests are, and are not

Vitest, Node environment, files in `tests/*.test.ts`, one flat folder named by
subject. `tests/setup.ts` sets the minimum environment; `server-only` is aliased
to a stub (`tests/stubs/server-only.ts`).

They are excellent at: **pure rules** (projection, assurance, policy, schedule,
authorization, scoring, corrections, manual-entry guards), validation schemas,
route handlers with a mocked Prisma, and structural checks.

They **cannot** cover anything whose correctness lives in:

- a **transaction** (event, evidence and audit committing together),
- a **constraint** or unique index (idempotency keys, the one-urgent rule),
- a **trigger** (append-only tables),
- `FOR UPDATE SKIP LOCKED` behaviour,
- real query planning or performance.

Mocked Prisma will happily "succeed" at all of those. For them, verify against
real Postgres.

### Structural tests

Some tests assert the *arrangement* of code rather than a function, because the
bug was in the arrangement. `mfa-enforcement.test.ts` fails if an admin page
relies on its layout for protection. `assessment-answer-key.test.ts` fails if the
string `isCorrect` appears in the taker-facing file. When a bug is in how pieces
fit, write one of these; a unit test of either half would have passed.

### Mocking

- Spy on `sendEmployeePushNotification` / `sendPushNotification` (push is also
  simulated under `NODE_ENV=test`).
- Pass `now` as an argument rather than faking timers.
- Prefer testing the service function over the Server Action wrapper, plus the
  refusal paths for the wrapper.

### Where tests live (by area)

| Area | Examples |
| --- | --- |
| Attendance pure rules | `attendance-projection`, `-policy`, `-schedule`, `-geofence`, `-providers`, `-corrections`, `-manual`, `-overtime-auth` |
| Attendance I/O | `attendance-events`, `-device-ingest`, `-mobile-ingest`, `-exceptions-queue`, `-cron-jobs`, `-timesheets`, `-excel-export` |
| Scheduling | `schedule-rota`, `schedule-copy-week`, `rota-patterns`, `holidays-and-cover` |
| Auth and access | `authorization`, `authorization-rbac`, `custom-roles`, `session`, `mfa-*`, `totp`, `password-reset`, `super-admin-rules`, `user-administration` |
| Mobile | `mobile-auth`, `mobile-attendance-api`, `mobile-offline-sync`, `review-demo`, `push-notifications`, `leave-requests` |
| Platform | `jobs`, `audit`, `rate-limit`, `env`, `logger`, `secret-box`, `email-*`, `proxy`, `openapi-spec` |
| Assessments and aptitude | `assessment-*`, `aptitude-*`, `test-completion-notifications` |
| Feedback | `api-feedback`, `feedback-*`, `analytics` |

## Database-bound work

For anything in the list above, verify against a **scratch database**, not the
dev one. Append-only tables cannot be cleaned up afterwards.

```bash
docker compose exec -T postgres psql -U basilissa -d postgres -c "create database basilissa_verify;"

DATABASE_URL="postgresql://basilissa:basilissa_password@localhost:5432/basilissa_verify" \
  ./node_modules/.bin/prisma migrate deploy

DATABASE_URL="postgresql://basilissa:basilissa_password@localhost:5432/basilissa_verify" \
  ./node_modules/.bin/tsx --conditions=react-server scratch-check.ts

docker compose exec -T postgres psql -U basilissa -d postgres -c "drop database basilissa_verify;"
```

- `--conditions=react-server` is required or `server-only` throws.
- Write the check as a throwaway script, exercise the real function against the
  real constraint, and **assert on the failure case** too (the unique index
  refuses the second row, the trigger refuses the UPDATE).
- Prefer the scratch script to prove the migration applies cleanly from zero as
  well as against current state.
- **Delete the scratch script and drop the database when done**, and confirm both
  happened.
- Use the scratch URL's host explicitly; do not rely on `.env` precedence to pick
  the right database.

## Authenticated verification

For any change to auth, permissions, guards or scoping: use a **real
authenticated session**.

An unauthenticated `curl` redirects at the outermost gate (`proxy.ts`) and
exercises none of the code being changed. It passes no matter what is broken. The
MFA lockout shipped broken because it was verified that way (register D1).

To mint a session:

1. Insert a `sessions` row for a throwaway user.
2. Sign a JWT with `SESSION_SECRET` carrying `sub`, `sid`, `sv` (the user's
   `sessionVersion`), and `exp`, as `lib/modules/identity/session.ts` does.
3. Send it as the `basilissa_admin_session` cookie.

Then test **both sides**: a user *with* the permission sees the page, and a user
*without* it, and a branch-scoped user for the wrong branch, are refused.

Use throwaway accounts (`*@basilissa.invalid`), never the real admin, and verify
the cleanup actually happened (users, sessions, role assignments removed).

## UI changes

Run the dev server and look at it; type checking proves the code compiles, not that
the screen works. Check: the golden path, the empty state, the loading state, a
user without permission, a narrow viewport, dark mode if the area supports it. For
the mobile-facing API, exercise it with a real bearer token, not just the unit
tests.

## What "done" means

- All four gates pass, unpiped.
- Database-bound behaviour verified on a scratch database, which is gone.
- Auth-affecting changes verified with a real session, with and without the
  permission.
- Docs updated in the same change.
- You can say what you did **not** verify.

Report outcomes faithfully. If a gate failed, say so with the output. If you
skipped a step, say that.
