# Basilissa Ghana — Customer Feedback System

A production-ready customer feedback system for Basilissa Ghana: a mobile-first,
QR-driven feedback form for customers (`/feedback`) and a protected analytics
dashboard for staff (`/admin`).

- Customers scan a branch QR code, pick their branch (or it's preselected from
  the QR link), answer exactly five fixed rating questions, and submit —
  anonymously. No login, no free text, no name/phone/email collected.
- Every submission is saved to PostgreSQL, emailed to a configured list of
  staff addresses via Resend, and shows up in the admin dashboard immediately.
- Admins sign in with email/password, manage branches (create, edit,
  activate/deactivate, download a QR code), and explore feedback analytics
  with filters, charts, and per-branch drill-downs.

## Tech stack

Next.js 16 (App Router, TypeScript) · PostgreSQL (Docker) · Prisma ·
Tailwind CSS v4 · shadcn/ui · Recharts · hand-rolled credentials auth (`jose`
signed JWT session cookies, following Next.js's own documented
["stateless sessions"](https://nextjs.org/docs/app/guides/authentication)
pattern — see "Why not Auth.js?" below) · Resend · Zod · pnpm.

---

## Prerequisites

- Node.js 20.9+ (Node 22 recommended — matches the Docker image)
- pnpm 10.x (`corepack enable` or `npm install -g pnpm`)
- Docker Desktop / Docker Engine + Docker Compose v2 (`docker compose ...`,
  not the old `docker-compose`)
- A [Resend](https://resend.com) account (free tier is fine) if you want real
  emails to send — the app runs and accepts feedback without one; email
  sending just logs an error and never blocks a submission.

## Environment setup

For local development, work in **`.env.local`**:

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in real values. At minimum for local development you
can keep the defaults, but you should:

- Generate a real `SESSION_SECRET`: `openssl rand -base64 32`
- Set `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` to what
  you want your first admin login to be
- Add a real `RESEND_API_KEY` and a `RESEND_FROM_EMAIL` on a domain verified
  with Resend if you want notification emails to actually deliver

See every variable's purpose and default in [`.env.example`](./.env.example).

### Which file wins

Highest priority first:

| Source | Used for |
| --- | --- |
| Real process environment | Vercel, docker compose `environment:`, CI. Always wins |
| `.env.development.local` | Rarely needed |
| **`.env.local`** | **Local development. Edit this one** |
| `.env.development` | Rarely needed |
| `.env` | Committed-style defaults / production values |

Nothing overrides a variable that is already set, so a platform-injected value
always beats a file.

**This applies to the Prisma CLI too**, which matters more than it sounds. On
its own the Prisma CLI reads `.env` and nothing else — so without intervention
`pnpm db:migrate`, `pnpm db:seed` and `pnpm db:studio` could point at a
different database than the app you are running. [`prisma.config.ts`](./prisma.config.ts)
teaches the CLI the same precedence Next.js uses, via Next's own
`loadEnvConfig`. Every Prisma command prints the host and database it is about
to touch:

```
[prisma] database target: localhost:5432/basilissa_feedback
```

If that line ever names a host you did not expect, stop.

**Never commit a real env file.** `.gitignore` excludes `.env*` and explicitly
keeps `.env.example` tracked.

`docker-compose.yml` follows the same precedence: it reads `.env` then
`.env.local`, both optional, so `docker compose up` uses your local values
rather than whatever is in `.env`.

> **Recommendation:** don't keep production secrets in a local `.env` at all —
> set them in the hosting platform's environment UI. A production database URL
> on a laptop is one `pnpm db:migrate` away from a bad afternoon.

---

## Running the full system with Docker

This is the primary, required way to run the project end-to-end.

```bash
docker compose up --build
```

This single command:

1. Builds the `app` image (multi-stage: installs deps, runs `next build`
   with standalone output, then assembles a minimal runtime image).
2. Starts `postgres` and waits for its healthcheck (`pg_isready`) to pass.
3. Starts `app` only once Postgres is healthy (`depends_on: condition:
   service_healthy`), and inside the container's entrypoint
   ([`docker/start.sh`](./docker/start.sh)) runs `prisma migrate deploy`
   before starting the Next.js server — so the schema is always up to date
   before the app accepts traffic.
4. Exposes the app on `http://localhost:3000` (configurable via `APP_PORT`
   in `.env`).

The database is **not** seeded automatically (see below) — that's a
deliberate, explicit, one-time step.

Once it's up:

```bash
# Seed the database (creates the admin account, 5 questions, sample branches)
docker compose exec app pnpm prisma db seed
```

Then visit:

- `http://localhost:3000/feedback` — the customer feedback flow
- `http://localhost:3000/admin/login` — the admin dashboard

### Docker architecture

```
postgres (postgres:16-alpine)          app (Next.js standalone, multi-stage build)
  - named volume: postgres_data          - port 3000 -> host
  - healthcheck: pg_isready               - healthcheck: GET /api/health
  - not published to the host              - depends_on: postgres (healthy)
                    \                     /
                     both on the `basilissa` Docker Compose network
```

- **`Dockerfile`** — three stages: `deps` (install), `builder` (`next build`,
  standalone output), `runner` (minimal image: standalone server + only the
  extra `node_modules` the Prisma CLI needs at startup, running as a
  non-root `nextjs` user). See inline comments for why a couple of
  `node_modules` subfolders are copied explicitly on top of the standalone
  output (a known Next.js + Prisma standalone-tracing gotcha).
- **`docker-compose.yml`** — `postgres` (named volume + `pg_isready`
  healthcheck), `app` (built from the `Dockerfile`, waits for Postgres to
  be healthy, has its own `/api/health`-based healthcheck), and an optional
  `seed` service behind the `tools` profile.
- **`.dockerignore`** — keeps `node_modules`, `.next`, `.git`, and `.env`
  out of the build context.
- **`docker/start.sh`** — the container's entrypoint: runs `prisma migrate
  deploy`, then `exec node server.js`.
- Postgres is **not published to the host** by default (`ports:` is
  commented out in `docker-compose.yml`) — only the `app` container can
  reach it, which is the production-safe default. Uncomment it locally if
  you want to connect a desktop DB client.
- `DATABASE_URL` inside Docker always uses the `postgres` service hostname
  (`postgresql://basilissa:basilissa_password@postgres:5432/basilissa_feedback`
  by default), not `localhost` — `docker-compose.yml` sets this explicitly
  on the `app` service, overriding whatever `DATABASE_URL` is in your `.env`
  (which is there for running `pnpm dev` outside Docker instead).

### Stopping and restarting (without losing data)

```bash
docker compose stop        # stop containers, keep them (and the volume)
docker compose start       # start them again — data is untouched

# or, to remove the containers but KEEP the named volume:
docker compose down        # data survives — the volume isn't deleted
docker compose up --build  # recreate and restart
```

`postgres_data` is a named Docker volume, so it survives `docker compose
down`, container restarts, and image rebuilds. It's only deleted if you
explicitly ask for that (see next section).

### Resetting the local database

```bash
# Nukes the Postgres volume — all feedback/branches/admin accounts are gone.
docker compose down -v

# Then bring everything back up from scratch:
docker compose up --build
docker compose exec app pnpm prisma db seed
```

For a lighter reset (drop and recreate the schema) when developing outside
Docker:

```bash
pnpm db:reset   # prisma migrate reset — prompts for confirmation
```

---

## Running without Docker (local development)

```bash
pnpm install
docker compose up postgres -d   # just the database
pnpm prisma migrate deploy      # or `pnpm db:migrate` for `migrate dev`
pnpm db:seed
pnpm dev
```

Make sure `DATABASE_URL` in **`.env.local`** points at `localhost:5432` for
this mode (the `.env.example` default already does). Confirm it before
migrating — every Prisma command prints its target:

```
[prisma] database target: localhost:5432/basilissa_feedback
```

## Prisma migrations

Migrations live in [`prisma/migrations/`](./prisma/migrations) and are
committed to the repo (a Prisma convention — migration history is part of
your codebase, not generated at deploy time).

- **Apply pending migrations** (what Docker does automatically on startup,
  and what CI/production should always use): `pnpm db:migrate:deploy`
  (`prisma migrate deploy`) — never edits the schema, only applies existing
  migration files.
- **Create a new migration** after changing `prisma/schema.prisma` (local
  dev only, needs a reachable database): `pnpm db:migrate` (`prisma migrate
  dev --name <description>`).
- **Prisma Studio** (browse/edit data visually): `pnpm db:studio`.

## Seeding the database

The seed script ([`prisma/seed.ts`](./prisma/seed.ts)) is idempotent — safe
to run any number of times:

```bash
pnpm prisma db seed
# or, against the Docker Compose stack:
docker compose exec app pnpm prisma db seed
# or, as a one-off container (doesn't require `app` to already be running):
docker compose --profile tools run --rm seed
```

It creates, using `upsert` keyed by a stable unique field:

- **The admin account**, from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` /
  `SEED_ADMIN_NAME`, password hashed with bcrypt. **If an admin with that
  email already exists, its password is left untouched** — re-running the
  seed (e.g. on every deploy) never reverts a password an admin changed
  in-app. Only a brand-new account picks up `SEED_ADMIN_PASSWORD`.
- **The five feedback questions**, upserted by their fixed display order.
- **Five sample branches** (Accra Mall, East Legon, Spintex, Osu, Airport
  Residential), upserted by slug.

### Default development admin credentials

From `.env.example`'s defaults — **change these before deploying anywhere
public**:

| | |
|---|---|
| Email | `admin@basilissa.gh` |
| Password | `ChangeMe123!` |

Sign in at `/admin/login`.

---

## Configuring Resend

1. Create a free account at [resend.com](https://resend.com).
2. Verify a sending domain (Resend → Domains), or use their shared testing
   domain while developing.
3. Create an API key (Resend → API Keys) and set it as `RESEND_API_KEY`.
4. Set `RESEND_FROM_EMAIL` to an address on that verified domain (e.g.
   `feedback@basilissa.gh`).
5. Set `FEEDBACK_NOTIFICATION_EMAILS` to a comma-separated list of every
   address that should receive a notification on each new submission.

Email delivery is **best-effort and non-blocking**: the feedback row is
always committed to Postgres first; sending the notification happens after,
inside a `try/catch` that only logs on failure
([`lib/email.ts`](./lib/email.ts)) — a Resend outage or a bad API key never
causes a customer's submission to fail.

## Generating branch QR codes

From the admin dashboard: **Branches → (select a branch)**. The branch page
shows the feedback URL (`{APP_URL}/feedback?branch={slug}`, with a
copy-to-clipboard button) and a QR code rendered server-side with the
[`qrcode`](https://www.npmjs.com/package/qrcode) package
(`app/api/admin/branches/[id]/qr/route.ts`, protected the same way every
other admin route is). Click **Download QR PNG** to save it for printing.

---

## Project structure

```
app/
  feedback/                 # public customer flow (/feedback)
  admin/
    login/                   # public admin login
    (dashboard)/              # route group: everything behind requireAdmin()
      page.tsx                 # dashboard (stats, filters, charts, recent list)
      branches/                 # list / new / edit / [id] analytics detail
  api/
    feedback/route.ts          # POST — the one public write API (rate-limited)
    admin/branches/[id]/qr/     # GET — QR PNG (protected)
    health/route.ts              # GET — DB connectivity check (Docker healthcheck)
components/
  ui/                        # shadcn-style primitives (Button, Card, Table, …)
  feedback/                   # the 5-question wizard
  admin/                       # dashboard filters, charts, forms, nav
  brand/logo.tsx                 # placeholder brand mark — see "Theming" below
lib/
  auth/                      # session.ts (jose JWT), dal.ts, actions.ts
  analytics.ts                 # every dashboard metric/chart query
  validations.ts                # all Zod schemas
  rate-limit.ts                  # shared rate limiter (Postgres-backed)
  email.ts                        # Resend notification template + send
  prisma.ts, env.ts, constants.ts, date.ts
prisma/
  schema.prisma, migrations/, seed.ts
tests/                       # vitest — see "Testing" below
docker/start.sh              # container entrypoint (migrate deploy → start)
```

## Theming

Every brand colour lives as CSS custom properties in
[`app/globals.css`](./app/globals.css) (mapped through shadcn's usual
`--primary`, `--secondary`, `--accent`, etc. tokens, plus a small
`--status-*` set used for rating badges/charts). Dropping in Basilissa's
official palette later is a one-file edit — no component changes needed.
The logo is a placeholder monogram in
[`components/brand/logo.tsx`](./components/brand/logo.tsx); swap its
contents for an `<Image src="/logo.svg" ... />` once the real logo file
exists, and every screen picks it up automatically (it's the only place
the wordmark/mark is rendered).

## Why not Auth.js?

The brief allows "Auth.js or another secure credentials-based
authentication solution." This project hand-rolls credentials auth with
signed, `httpOnly`, `Secure`, `SameSite=Lax` JWT session cookies via
[`jose`](https://github.com/panva/jose) — which is exactly the pattern
[Next.js's own authentication guide](https://nextjs.org/docs/app/guides/authentication)
documents as its recommended "stateless sessions" approach, including the
proxy-level optimistic check + Data Access Layer verification
defense-in-depth pattern this project follows (`proxy.ts` +
`lib/auth/dal.ts`). Next 16 is very new; Auth.js v5's provider/adapter
configuration adds real complexity and a moving-target compatibility
surface for comparatively little benefit here — one credentials provider,
one session shape, no OAuth. The result is smaller, fully auditable, and
uses nothing beyond direct dependencies the stack already requires
(Next.js + Zod + bcrypt).

## Security notes

- Passwords hashed with bcrypt (`bcryptjs`, cost factor 12) — never stored
  or logged in plaintext.
- Session cookies: `httpOnly`, `Secure` in production, `SameSite=Lax`,
  8-hour expiry, verified server-side on every protected request (never
  trusted from the client).
- **Sessions are revocable.** The cookie is a signed JWT carrying only
  pointers (user id, session id, session version); the authoritative record
  is a `sessions` row read on every request. That is what lets a terminated
  or suspended user lose access on their next request rather than whenever
  their token happens to expire, and what makes a demotion take effect
  immediately instead of at next sign-in. `sessionVersion` on the user
  invalidates every outstanding token at once — used on password change,
  privilege change and termination.
- **Authorisation is `(role, scope)`.** A role grants nothing until it is
  paired with a scope, because "branch manager" is meaningless without "of
  which branch". `lib/modules/identity/authorization.ts` holds the rules as
  pure functions with no I/O, so the whole matrix is tested exhaustively.
  `branchScope()` exists so list queries are *constrained* rather than
  filtered afterwards — filtering in the UI is not authorisation.
- Every admin page, layout, server action, and admin API route goes through
  the Data Access Layer (`requireAuth` / `requirePermission`) —
  `proxy.ts`'s cookie check is a fast-path redirect, not the security
  boundary.
- Login gives the same message for a wrong password, an unknown address, and
  a suspended or terminated account, so it cannot be used to discover which
  addresses are real or when someone's access was cut.
- **Every state-changing action is audited, and the log is immutable.**
  `audit_logs` records who acted, what changed, and from what to what. The
  entry is written *inside the same transaction* as the change, so a change
  cannot exist without its record. Immutability is enforced by database
  triggers rather than convention — `UPDATE` and `DELETE` are rejected
  outright, because an audit log the application can edit is not an audit
  log. Sign-ins and failed sign-ins are recorded too; failed attempts store
  the attempted address in `metadata` rather than the actor fields, since
  nothing about it has been verified.
- All external input (feedback submissions, login, branch forms, dashboard
  filters) is validated with Zod (each module's `validation.ts`) before
  touching the database.
- The public feedback API (`POST /api/feedback`) is rate-limited per IP
  (20 requests / 10 minutes) and rejects submissions to inactive branches,
  incomplete answer sets, or a stale/changed question set.
- No customer PII is ever collected or stored — no name, phone, email, or
  IP address is written to the database or shown in the dashboard. The rate
  limiter needs a per-caller key, so it HMACs the caller's key (which
  contains the IP) before that key reaches Postgres; only the keyed digest
  is stored. A plain hash would not do — the IPv4 space is small enough to
  enumerate — so the digest is keyed with `SESSION_SECRET`.
- Login has the same per-IP rate limit, plus a constant-shape
  `bcrypt.compare` against a dummy hash for unknown emails so the response
  doesn't leak which addresses have an account.

## Provisional values

Several settings are placeholders chosen to unblock work, not decisions anyone
made — attendance grace periods and overtime thresholds most importantly. They
are flagged `isProvisional` in the database and tracked in
[Open Decisions & Provisional Values](./docs/architecture/open-decisions.md),
along with what is deferred, what is built but not wired up, and what was
planned but not built.

Read that before assuming a default is intentional.

## Background worker

Some work does not belong in a request: sending the feedback notification
email, and later attendance settlement and Odoo synchronisation. Those run in a
separate long-running process (see
[ADR 0001](./docs/architecture/decisions/0001-runtime-topology.md)).

```bash
pnpm worker                      # locally, against .env.local
docker compose up worker         # same image as `app`, different command
```

The queue is a Postgres table, not a broker — see
[ADR 0002](./docs/architecture/decisions/0002-no-redis.md). The property that
decides it: a job is enqueued *inside* the transaction that causes it, so work
is never scheduled for a change that rolled back and never lost for one that
committed.

> **Deployment prerequisite.** Feedback notification emails go through this
> queue. Until the worker runs, submissions are still recorded correctly but
> the emails sit unsent in `jobs`. Starting the worker drains the backlog, and
> it logs queue depth on every tick and warns when the queue falls behind.

Behaviour worth knowing:

- Failures retry with jittered exponential backoff, then land in `DEAD`. Dead
  jobs are kept, never deleted — a dead job means something needs a person.
- A worker killed mid-job leaves its claim behind; `reclaimStuck` returns those
  jobs to the queue after 15 minutes.
- `SIGTERM` finishes the current batch and exits, so a deploy does not strand a
  half-run job.
- Poll interval defaults to 60s and is a **cost** parameter as well as a
  latency one: a polling worker prevents managed Postgres from autosuspending.

## Logging

Every log line is one JSON object on stdout/stderr:

```json
{"ts":"2026-09-06T00:33:47.650Z","level":"info","message":"job succeeded","worker":"worker-088df9a4","jobId":"job_1"}
```

That is deliberately the entire transport. Vercel, Railway, Docker and a plain
server all collect stdout, so nothing assumes a platform
([ADR 0001](./docs/architecture/decisions/0001-runtime-topology.md)) and
nothing costs anything. `LOG_LEVEL` sets the threshold (`debug` outside
production, `info` in it).

Two behaviours worth knowing:

- **Errors are unwrapped.** `JSON.stringify(new Error("boom"))` is `{}` —
  message and stack are non-enumerable — so passing an error straight to a log
  collector records that something broke while discarding what and where. Pass
  the `Error` itself and the logger extracts name, message, cause and (outside
  production) stack.
- **Sensitive field names are redacted**, matched case-insensitively as
  substrings, nested values included. `DATABASE_URL`, `sessionToken`,
  `passwordHash` and `Authorization` are all caught without enumerating
  variants. Over-broad on purpose: a redacted field that did not need it costs
  nothing, and the reverse sits in a log aggregator forever.

No hosted error tracker is wired up — that is a vendor and a cost, and the
choice is yours. `setErrorSink()` is the seam: implement one function and every
existing `logger.error` call starts reporting, with no call sites touched.

## Testing

```bash
pnpm test          # vitest run — all tests, once
pnpm test:watch    # vitest — watch mode
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
```

Tests live in [`tests/`](./tests) and cover: submission validation
(`validations.test.ts`), analytics calculations — distribution/trend
bucketing, rounding (`analytics.test.ts`), the rate limiter
(`rate-limit.test.ts`), admin session JWT signing/verification
(`session.test.ts`), admin route protection (`proxy.test.ts`), the feedback
API end-to-end against a mocked Prisma client — success, incomplete
answers, inactive branch, unknown branch, and duplicate-submission
idempotency (`api-feedback.test.ts`), and seed-data well-formedness /
idempotency preconditions (`seed-data.test.ts`). None of these need a
running database — Prisma is mocked where a test needs it.

## Production deployment considerations

- **Change every default**: `SESSION_SECRET`, `POSTGRES_PASSWORD`,
  `SEED_ADMIN_PASSWORD`, and use a real `RESEND_API_KEY`/`RESEND_FROM_EMAIL`.
- **Don't expose Postgres publicly** — keep the `ports:` mapping on
  `postgres` commented out (as shipped); only `app` should reach it.
- **Put the app behind HTTPS** (a reverse proxy / load balancer terminating
  TLS) — the session cookie's `Secure` flag requires it in production, and
  `NODE_ENV=production` (set in the Dockerfile) already enables that flag.
- **Rate limiting is shared across instances**, backed by the
  `rate_limit_counters` table, with a free per-instance in-memory
  short-circuit in front of it. It fails *open* if the database is
  unreachable: rate limiting is abuse prevention, not correctness, and
  failing closed would turn a transient database blip into a total outage
  of the public feedback form. See
  `docs/architecture/decisions/0002-no-redis.md` for why this is Postgres
  and not Redis.
- **Back up `postgres_data`** on whatever host runs it, or point
  `DATABASE_URL` at a managed Postgres instance instead of the bundled
  container for production (the app only needs a Postgres connection
  string — the bundled `postgres` service is for local/self-hosted use).
- **Run migrations as a release step**, not implicitly trusting container
  start order in a multi-replica deployment — `docker/start.sh` runs
  `prisma migrate deploy` on every container start, which is safe (it's
  idempotent) but in a multi-replica rollout you may prefer a dedicated
  migration job/step instead.
- **Point `NEXT_PUBLIC_APP_URL` at the real public URL** — it's what QR
  codes and the "view in dashboard" email link are built from.

## Known limitations

- Elapsed `rate_limit_counters` rows are purged opportunistically (roughly
  one request in a hundred). This moves onto the job runner in Phase 0.
- No password-reset flow for admins (out of scope for this brief) — reset
  a forgotten password by updating `passwordHash` directly, or by deleting
  the `AdminUser` row and re-seeding.
- The placeholder brand mark/colours are ready to swap in Basilissa's real
  logo and palette (see "Theming") but aren't the final brand assets.
- Automated tests run against a mocked Prisma client rather than a real
  Postgres instance. The manual verification flow above (seed → submit
  feedback → check the dashboard) is the full end-to-end check against a
  real database.
