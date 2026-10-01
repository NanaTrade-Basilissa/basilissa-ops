# Codebase map

Where things live, and which door to use. For the boundary rules and why they
exist, see [conventions](./conventions.md) and [`lib/README.md`](../../lib/README.md).

## Top level

| Path | What it is |
| --- | --- |
| `app/` | Next.js App Router. Pages, Route Handlers, layouts. UI and HTTP only. |
| `components/` | React components. `components/ui/` is shadcn/ui, `components/admin/` is admin screens' pieces, plus `aptitude/`, `assessment/`, `feedback/`, `brand/`, `docs/`. |
| `lib/modules/` | Domain logic, one folder per domain. |
| `lib/platform/` | Shared infrastructure with no domain knowledge. |
| `lib/email-templates/` | React Email style HTML templates (`layout`, `feedback`, `assessments`, `aptitude`, `identity`). |
| `worker/` | Background worker entrypoint (`index.ts`), job handler registry (`registry.ts`), env bootstrap (`env.ts`). |
| `prisma/` | `schema.prisma`, `migrations/`, seeds, and one-off operational scripts (`pilot-*.ts`). |
| `tests/` | Vitest. One flat folder, named by subject (`attendance-projection.test.ts`). |
| `docs/` | This documentation. See [docs/README.md](../README.md). |
| `proxy.ts` | Next.js 16 proxy (the renamed `middleware.ts`). Optimistic session-cookie check and sliding refresh only. Not a security boundary. |
| `docker/start.sh` | Container entrypoint. `PROCESS_ROLE=worker` runs the worker, anything else migrates then serves. |
| `docker-compose.yml`, `Dockerfile` | Local stack (postgres, app, worker) and the one image used everywhere. |
| `.github/workflows/ci.yml` | Lint, typecheck, test, build, then a container build as a portability guard. |
| `vercel.json` | One cron: `/api/cron/attendance` every 15 minutes. |

## `app/`

| Route area | Purpose |
| --- | --- |
| `app/admin/(dashboard)/<area>/` | Every authenticated admin screen. Each page calls its own `require*Permission`. The `layout.tsx` gates chrome only. |
| `app/admin/{login,forgot-password,reset-password,no-access}` | Unauthenticated or outside-the-shell pages. `PUBLIC_ADMIN_PATHS` in `proxy.ts` lists the ones reachable without a session. |
| `app/api/v1/` | Mobile app API: `auth/{login,logout,me,mobile/otp/{request,verify}}`, `attendance/{punch,punch/sync,status,history,leave-requests}`, `notifications` (inbox list, `unread-count`, `{id}/read`, `read-all`, `push-token`). Bearer `deviceToken` auth. |
| `app/iclock/` | Fingerprint terminal protocol (`cdata`, `getrequest`). |
| `app/api/cron/attendance` | Time-driven sweeps for platforms with cron and no worker. |
| `app/api/admin/` | Admin-only downloads: attendance Excel export, QR images. |
| `app/api/feedback`, `app/feedback` | Public customer feedback. |
| `app/assessment/`, `app/aptitude/` | Tokenised public taker pages. |
| `app/privacy`, `app/delete-account` | Required by the app stores. |
| `app/api-docs`, `app/docs`, `app/api/docs/openapi.json` | API documentation and its generated spec. |
| `app/api/health` | Liveness. |

Admin areas under `(dashboard)`: `aptitude-tests`, `assessments`, `attendance`,
`announcements`, `audit-trail`, `branches`, `devices`, `email-queue`, `employees`, `feedback`,
`feedbacks`, `holidays`, `jobs`, `leave`, `payroll`, `questions`, `roles`,
`security`, `settings`, `shifts`, `users`. Navigation is defined in
`components/app-sidebar.tsx` and `components/admin/admin-nav.tsx`.

## `lib/modules/`

Each module exposes **entry files**; the rest is private. The allowed entry
names live in `PUBLIC_ENTRIES` in `eslint.config.mjs`.

| Module | Owns | Notes |
| --- | --- | --- |
| `identity` | Users, sessions, MFA, password reset, roles and permissions, audit queries, the email queue and job monitor admin, the DAL (`requirePermission` and friends) | Everyone depends on it. Read [auth-and-permissions](./auth-and-permissions.md). |
| `attendance` | Events, ingest pipeline, assurance, geofence, projection, settlement, corrections, manual entry, schedules, patterns, holidays, cover shifts, leave, overtime authority, reminders, mobile auth and punch, Excel export | The core domain. [attendance-pipeline](./attendance-pipeline.md). |
| `employees` | Employee records, branch assignments, bulk import, schedule repository | `import.ts` is a pure public entry. |
| `branches` | Branch actions and validation (geofence, hours, timezone) | Thin. |
| `devices` | Fingerprint terminal registry actions and validation | **Not listed in `MODULES` in `eslint.config.mjs`, so its boundaries are not yet enforced.** |
| `announcements` | Messages from the dashboard to staff: audience rules, send, history, push fan-out job | Pure rules in `audience`. Spec: [announcements](../specs/announcements.md). |
| `feedback` | Public submission, analytics, scoping, recipients, notification job | |
| `questions` | Feedback question admin | |
| `assessments` | Internal staff assessments: authoring, invitations, taking, scoring, results | Answer key must never reach the browser (`taking.ts` header). |
| `aptitude` | Candidate aptitude tests, same shape, plus section timing and auto-submit | |

### Entry files you will meet

| Entry | Contents | Client Component safe |
| --- | --- | --- |
| `constants`, `validation` | Values, types, Zod schemas | yes |
| `authorization`, `policy`, `assurance`, `providers`, `scoring`, `events`, `geofence`, `schedule`, `projection`, `manual`, `corrections`, `import`, `queries` | Pure rules or pure-ish queries. No I/O in the first group. | mostly (check for `server-only`) |
| `server` | Server-only domain logic barrel | no |
| `actions` | Server Actions (`"use server"`) | imported directly, never re-exported through a barrel |
| `jobs` | Background-work entry. **The only thing the worker may import.** | no |

## `lib/platform/`

| File | Purpose |
| --- | --- |
| `prisma.ts` | The Prisma client singleton. |
| `env.ts` | Lazy, validated environment (`getEnv`, `isSmsConfigured`). Validates on first use, not on import. |
| `jobs.ts` | Postgres job queue mechanism: `enqueue` (accepts a transaction), `claim`, retries, dead letters. Handlers live in `worker/registry.ts`. |
| `audit.ts` | `recordAudit`. Throws on failure by design. |
| `email.ts` | Gateway client, delivery records (`EmailDelivery`), retention purge. Never throws, reports instead. |
| `sms.ts` | Gateway client, OTP dispatch, phone normalisation. |
| `push.ts` | `sendPushNotification`, `sendEmployeePushNotification`. FCM and Expo tokens. |
| `slack.ts` | Operational alerts: email failures, dead jobs, worker crashes, quarantined punches, OTP failures. |
| `inbox.ts` | The staff inbox: write, list, count unread, mark read. Domain-free, so every module may use it. |
| `rate-limit.ts` | Postgres-backed counters. |
| `secret-box.ts` | Encryption for stored secrets (key derived from `SESSION_SECRET`, register C6). |
| `totp.ts` | RFC TOTP for MFA. |
| `date.ts` | Time-zone-aware date arithmetic (`dateKeyInZone`, `zonedMinutesToUtc`). |
| `logger.ts` | Structured logging (`scoped("area")`). |
| `forms.ts`, `constants.ts` | Form helpers and shared constants. |
| `openapi-spec.ts` | Source of the public API spec. |
| `play-listing.ts` | Google Play compliance copy. |

## Task to file

| I want to... | Start at |
| --- | --- |
| See what permissions exist | `PERMISSION_REGISTRY` in `lib/modules/identity/permissions.ts`, `ROLE_PERMISSIONS` in `authorization.ts` |
| Change how a day is computed | `lib/modules/attendance/projection.ts` (pure), `settle.ts` (I/O) |
| Change what counts as late or overtime | `policy.ts`, and the editor under `app/admin/(dashboard)/attendance/policy` |
| Change who may punch where | `ingest.ts`, `cover.ts`, `geofence.ts` |
| Add a capture method | `providers.ts`, then an adapter producing an `IngestCommand` |
| Change shift resolution | `schedule.ts` (pure), `settle.ts` `loadScheduleInputs`, `patterns.ts`, `holidays.ts` |
| Add a mobile endpoint | `app/api/v1/...`, update `lib/platform/openapi-spec.ts` and its test |
| Add a background job | `lib/modules/<m>/jobs.ts`, then `worker/registry.ts` |
| Send an email | `lib/email-templates/`, `lib/platform/email.ts`, usually through a job |
| Send a message to staff | `lib/modules/announcements/` for broadcasts; `lib/platform/inbox.ts` plus `push.ts` for a single notice |
| Add an admin screen | an `app/admin/(dashboard)/<area>/page.tsx` plus `components/admin/`, nav in `admin-nav.tsx` |
| Add a table | `prisma/schema.prisma`, a migration, [data-model](./data-model.md) |
| Find why a decision was made | [open-decisions](../architecture/open-decisions.md), then the [ADRs](../architecture/decisions/README.md) |

Full recipes with the checks that go with each: [workflows](./workflows.md).
