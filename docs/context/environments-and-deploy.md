# Environments and deploy

## Environments

| Environment | Web | Database | Worker | Notes |
| --- | --- | --- | --- | --- |
| **Local (Docker)** | `docker compose up -d`, app on `${APP_PORT:-3000}` (3001 on the main dev machine) | Postgres 16 container on 5432 | `worker` service in compose | Containers run `NODE_ENV=production`. No bind mount: the image holds a baked copy. |
| **Local (host)** | `pnpm dev` | The compose Postgres, or any | `pnpm worker` | |
| **CI** | `.github/workflows/ci.yml` | none needed | none | Lint, typecheck, test, build, then container build. |
| **Production** | Vercel | Neon (serverless Postgres 16) | Railway, plus a redundant copy on Google Cloud Run | See [HANDOVER](../HANDOVER.md) for the current state. |

**Do not touch the production database.** Migrations against Neon are run by the
user. See [Migrations](#migrations).

## Environment variables

Validated lazily by `lib/platform/env.ts` (first use, not import), so a build
needs no secrets. `.env.example` is the template; keep it in step with this
list.

### Required

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. In compose it is overridden to the service hostname. |
| `SESSION_SECRET` | 32+ characters (`openssl rand -base64 32`). Signs sessions. **Also the source of the encryption key** for TOTP secrets and mobile device tokens (register C6). The app and the worker must share the same value. Rotating it signs everyone out and invalidates issued mobile tokens. |
| `NEXT_PUBLIC_APP_URL` | Public base URL. Falls back to `APP_URL`, Vercel and Railway domain variables, then `localhost:$PORT`. |

### Optional integrations

| Variable | Purpose | Unset means |
| --- | --- | --- |
| `EMAIL_SERVER_URL` | Email gateway endpoint | Email is `skipped`, not failed |
| `SMS_CHARGE_URL`, `SMS_GATEWAY_AUTH_TOKEN`, `SMS_SENDER_ID` | Announcement SMS endpoint (default `https://nana-trade-server.vercel.app/sms/charge`), optional Bearer token, sender name (default `Basilissa`) | **SMS really sends** to the default gateway. Set `SIMULATE_SMS=true` to log instead |
| `OTP_GATEWAY_URL` | OTP dispatch endpoint | built-in default |
| `SLACK_WEBHOOK_URL` | Ops alerts | no alerts |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | FCM credentials (raw JSON or base64); falls back to `GOOGLE_APPLICATION_CREDENTIALS` | FCM sends fail or fall back to default credentials |
| `CRON_SECRET` | Authenticates `/api/cron/attendance` | **The route accepts any caller.** Set it in production. |

### Behaviour switches

| Variable | Effect |
| --- | --- |
| `PUSH_NOTIFICATIONS_DISABLED`, `EXPO_PUSH_DISABLED` | `true` simulates push (logged, not sent) |
| `SIMULATE_SMS`, `SIMULATE_OTP` | Log instead of sending SMS (announcements and OTP) |
| `LOG_LEVEL` | Logger verbosity |
| `PROCESS_ROLE` | `worker` makes the container run the worker; anything else migrates then serves |

### Worker tuning

`WORKER_POLL_INTERVAL_MS` (60 s), `WORKER_BATCH_SIZE` (5),
`WORKER_PERIODIC_INTERVAL_MS` (15 min), `WORKER_STALE_JOB_MS` (15 min, must
exceed the longest plausible job or a slow job runs twice),
`WORKER_BACKLOG_WARN_MS` (10 min), `WORKER_NAME` (log prefix). Poll interval is a
cost parameter: see [background-work](./background-work-and-notifications.md).

### Seeding and one-off scripts

`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`;
`REVIEW_DEMO_PHONE`, `REVIEW_DEMO_OTP` (app-store review account, register A7);
`ALLOW_REMOTE`, `PILOT_ALLOW_REMOTE` (guards on scripts that would otherwise
refuse a non-local database); `PRISMA_ENV_FILE` (used by the production migrate
script).

### Which file wins

`.env` is read first, then `.env.local` overrides it, for the app, the Prisma
CLI and `docker compose` alike. **Put local values in `.env.local`.** `.env` is
the production-shaped file; compose loads both so local containers do not inherit
production secrets. Neither is committed.

## Runtime and build

- Node 22, pnpm 10 (see `ci.yml`). `postinstall` runs `prisma generate`, which
  needs no database.
- `build` is plain `next build`. Nothing is deployed or migrated automatically.
- `next.config.ts`: `output: "standalone"` everywhere except Vercel, which uses
  its own adapter. The Dockerfile copies only the standalone output.
- The Docker image has a **RHEL Prisma target** for Vercel compatibility.
- One image, two roles, chosen by `PROCESS_ROLE`. Why: custom start commands on
  most platforms override `CMD`, not a hard-coded `ENTRYPOINT`, so switching role
  inside `start.sh` needs nothing from the platform beyond one variable (ADR 0001).
- The app role runs `prisma migrate deploy` on start. **The worker role must not.**
  Exactly one process applies migrations.

## Topology constraints (ADR 0001)

Binding, not preferences:

- No Vercel-specific APIs or packages in business or domain logic (no `@vercel/*`
  dependency for logic, no `geolocation()`, `ipAddress()`, `waitUntil()`). The
  repo already contains `@vercel/analytics` and `@vercel/speed-insights` for the
  UI layer only.
- CI builds the container on every PR, so portability is exercised rather than
  assumed.
- The worker needs no public domain and no exposed port; it serves no HTTP.

## Migrations

```
local     pnpm db:migrate            (prisma migrate dev; creates and applies)
verify    scratch database + prisma migrate deploy   (see testing doc)
deploy    app container start runs prisma migrate deploy
production   the USER runs: pnpm db:migrate:deploy:prod
```

- `prisma migrate deploy` is the only safe command against anything shared.
  `migrate dev` can reset a database; `db push` bypasses the history.
- **Migrate first, then deploy code that needs it.** They are separate acts. A
  deploy that outruns its migration breaks; a migration that outruns its deploy
  is harmless if the migration is additive.
- Prefer **additive, backwards-compatible** migrations (new nullable columns, new
  tables) so the old and new code both run during the window between them.
- When a change is built but not yet migrated in production, say so in
  [HANDOVER](../HANDOVER.md) and the register, with the exact production steps.
  D4 and D5 are the pattern. Today that applies to public holidays, cover shifts
  and rota patterns.
- Append-only tables (`attendance_events`, `attendance_corrections`,
  `audit_logs`) cannot be cleaned up after a test, so never test against dev or
  production data on them.

## Git and release

- Features branch from `develop`. `main` only receives `--ff-only` merges from
  `develop`, so the two stay identical and there is one migration chain. Never
  branch a feature from `main`.
- Commit or push only when asked.
- Gates before every commit, to completion, with real exit codes:
  `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
- Commit messages follow the existing style: `feat(scope):`, `fix(scope):`,
  `chore:`, `docs:`.

## Operating it

| Question | Where to look |
| --- | --- |
| Is the worker alive and is the queue draining? | Worker logs (queue depth every tick), the admin **Jobs** screen, Slack for dead jobs |
| Did an email go out? | Admin **Email queue**, `EmailDelivery` rows |
| Why is a punch missing? | Slack quarantine alerts, `QuarantinedEvent`, then the Exceptions queue |
| Who changed this? | Admin **Audit trail** |
| Terminal not reporting? | `Device.lastSeenAt`, `DeviceLog`, [device findings](../architecture/device-investigation-findings.md) |
| API contract | `/api-docs`, source in `lib/platform/openapi-spec.ts` |
| Health | `/api/health` |
