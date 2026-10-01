# System overview

## What this is

Basilissa Ghana runs retail branches. This repository began as a customer
feedback system (QR code, short survey, email to the branch) and is being grown
into an **operations platform**:

- **Customer feedback**: public QR survey per branch, analytics, email alerts.
- **Staff attendance**: clock in and out from the mobile app (GPS geofence) or a
  fingerprint terminal, with corrections, exceptions, timesheets and payroll
  figures.
- **Scheduling**: shifts, weekly assignments, rota patterns, one-day overrides,
  cover shifts, public holidays, leave requests.
- **HR**: internal assessments for staff, aptitude tests for candidates.
- **Administration**: roles and permissions, MFA, audit trail, email queue, job
  monitor.
- **Later**: Odoo ERP sync (phase 4) and facial verification (phase 6), both
  deferred. See [implementation-plan](../architecture/implementation-plan.md).

The business is small and the system is real: attendance data feeds payroll.
That single fact explains most of the rules in this documentation set (pure
calculation, immutable events, audit that fails the operation).

## Who uses it

| Actor | Surface | Notes |
| --- | --- | --- |
| Customers | `/feedback` (QR code) | Anonymous, rate limited. |
| Candidates | `/aptitude/[token]`, `/aptitude/public/[token]` | Tokenised, single use. |
| Staff being assessed | `/assessment/[token]`, `/assessment/public/[token]` | Tokenised. |
| Employees | Mobile app (separate repo, `basilissa-employee-app`) | Talks to `/api/v1`. |
| Fingerprint terminals | `/iclock/cdata`, `/iclock/getrequest` | ZKTeco K40 Pro, ADMS push protocol. |
| Managers, HR, admins | `/admin` | RBAC with branch scoping, MFA for privileged roles. |
| Schedulers | `/api/cron/attendance` | Called by Vercel cron every 15 minutes. Needs `CRON_SECRET` if set. |
| Operators | `/api/health`, Slack alerts | |

Public pages for the app stores: `/privacy`, `/delete-account`. API docs:
`/api-docs` and `/docs`, generated from `lib/platform/openapi-spec.ts`.

## Runtime topology

```
   Browsers (admin, public)          Mobile app            Fingerprint terminals
          |                              |                          |
          |  HTTPS                       |  Bearer deviceToken      |  ADMS push
          v                              v                          v
  +----------------------------------------------------------------------+
  |  Next.js app (Vercel today; same Docker image elsewhere)             |
  |  app/admin  app/api/v1  app/iclock  app/api/cron  public pages       |
  |  Server Actions and Route Handlers -> lib/modules/* -> lib/platform  |
  +-------------------------------+--------------------------------------+
                                  |  Prisma
                                  v
                    +-----------------------------+
                    |  PostgreSQL 16 (Neon today) |  <- source of truth AND
                    |  data, job queue, sessions, |     queue, locks, rate limits
                    |  rate limits, audit         |     (ADR 0002: no Redis)
                    +-------------+---------------+
                                  ^
                                  |  Prisma, FOR UPDATE SKIP LOCKED
  +-------------------------------+--------------------------------------+
  |  Worker (separate long-running process, same image, PROCESS_ROLE=worker)
  |  drains the job queue, runs time-driven sweeps                       |
  +----------------------------------------------------------------------+

  Outbound from app or worker:
    email  -> HTTP gateway (EMAIL_SERVER_URL, Nodemailer service)
    SMS    -> HTTP gateway (SMS_GATEWAY_URL; Hubtel is the provider)
    push   -> Firebase Cloud Messaging via firebase-admin, and Expo tokens
    alerts -> Slack incoming webhook (SLACK_WEBHOOK_URL)
```

Three decisions shape this picture, each with an ADR:

1. **Vercel plus a separate worker** ([ADR 0001](../architecture/decisions/0001-runtime-topology.md)).
   Vercel functions cannot outlive a request, and the worker has to. Vercel and
   Neon are the *current deployment*, not an architectural dependency: no
   Vercel-specific APIs in domain logic, and CI builds the container to keep
   that honest.
2. **No Redis** ([ADR 0002](../architecture/decisions/0002-no-redis.md)).
   Postgres serves the queue, locks, sessions, rate limits and nonces.
   Core attendance must keep working when optional infrastructure is down.
3. **Odoo is never a runtime dependency.** Attendance works with Odoo absent;
   sync is an outbox drained later (deferred, phase 4).

## Where each process is hosted

From [HANDOVER](../HANDOVER.md) (check there for the current state, this can
change): web on Vercel, database on Neon (Postgres 16), the worker on Railway
with a redundant copy on Google Cloud Run. Docker images are built for
`linux/amd64`. Locally, `docker compose up -d` runs Postgres, the app and the
worker.

## The shape of the code

```
app/ and components/        UI and HTTP only. No business rules.
        |
lib/modules/<domain>/       Domain logic. May use lib/platform and other modules'
        |                   PUBLIC entry points only.
lib/platform/               Shared infrastructure. Never imports a module.
```

Details and the full directory map: [codebase-map](./codebase-map.md).
Boundaries are enforced by ESLint, not by convention.

## Time and place

- Default time zone is `Africa/Accra` (UTC, no daylight saving). Each branch
  carries its own `timezone`, and "which day does this punch belong to" is
  decided in the branch's zone. See `lib/platform/date.ts` and
  [attendance-pipeline](./attendance-pipeline.md#work-date).
- Phone numbers are normalised to `+233` format (`normalizePhoneNumber` in
  `lib/platform/sms.ts`).
- Currency and payroll rules are not modelled yet: the system produces minutes,
  not money.

## Current state in one paragraph

Attendance, scheduling, the policy editor, aptitude tests, leave, holidays and
rota patterns are built and live across environments. The last two schema
changes (public holidays and cover shifts, rota patterns) are built but have
**not yet been migrated in production**; the production migration is run by the
user. Announcements and broadcast messaging are specified but not built
([spec](../specs/announcements.md)). For the authoritative list, read
[HANDOVER](../HANDOVER.md) and [open-decisions](../architecture/open-decisions.md).
