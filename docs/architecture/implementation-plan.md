# Basilissa Operations Platform — Implementation Plan & Phases

> **Status:** Planning. No implementation has begun.
> **Date:** 2026-09-05
> **Baseline:** commit `67481f5` — the live Basilissa Ghana Customer Feedback System
> **Companion:** [Architecture & Discovery Assessment](./attendance-platform.md)
>
> This plan is written against the **actual existing repository**, not a
> greenfield application. Every phase states what is reused unchanged, what is
> refactored, and what is deferred.

---

## Contents

- [How to read this plan](#how-to-read-this-plan)
- [Sequencing at a glance](#sequencing-at-a-glance)
- [Phase 0 — Foundation](#phase-0--foundation)
- [Phase 1 — Attendance Core](#phase-1--attendance-core)
- [Phase 2 — Fingerprint Integration](#phase-2--fingerprint-integration)
- [Phase 3 — Manager Operations](#phase-3--manager-operations)
- [Phase 4 — Odoo Integration](#phase-4--odoo-integration)
- [Phase 5 — Mobile Attendance](#phase-5--mobile-attendance)
- [Phase 6 — Facial Verification](#phase-6--facial-verification)
- [Phase 7 — Scheduling & Overtime (Advanced)](#phase-7--scheduling--overtime-advanced)
- [Phase 8 — Feedback & Branch Operations](#phase-8--feedback--branch-operations)
- [Parallel Tracks](#parallel-tracks)
- [Risks & Unknowns Gating Each Phase](#risks--unknowns-gating-each-phase)
- [What Is Explicitly Reused, Refactored, Deferred](#what-is-explicitly-reused-refactored-deferred)

---

## How to read this plan

**Two deviations from the requested phase structure**, both explained in the
architecture document's §21:

- **Minimum viable scheduling moves from Phase 7 into Phase 1** (D6). Phase 3
  requires late arrival, missing clock-outs and overtime — all undefined without
  scheduled start and end times. Phase 7 becomes *advanced* scheduling (rotas,
  pre-authorisation, partial approval, disputes).
- **Phase 4 (Odoo) is an externally gated parallel track, not a sequential
  phase** (D13). Contract work starts in Phase 0; implementation runs whenever
  Odoo is ready, without blocking Phases 5–8.

Effort figures are order-of-magnitude for a small team (2–3 engineers) and are
**not commitments** — several depend on unknowns listed at the end.

---

## Sequencing at a glance

```
Phase 0  FOUNDATION                              ~3-4 wk   BLOCKING
   │     identity · RBAC · API · modules · jobs · audit · runtime
   │
   ├──────────────┬──────────────┬─────────────────┬──────────────────┐
   │              │              │                 │                  │
   ▼              ▼              ▼                 ▼                  ▼
Phase 1        DEVICE         ODOO API         MOBILE UX/API      LEGAL/DPIA
ATTENDANCE     INVESTIGATION  CONTRACT         CONTRACT           TRACK
CORE           (U1, U2)       (U3)             design             (U9)
~4-5 wk        ~1-2 wk        negotiation      ~1 wk              starts now
   │           (parallel)     (parallel)       (parallel)         (parallel)
   │              │              │                 │
   ▼              ▼              │                 │
Phase 2  FINGERPRINT INTEGRATION │                 │
~3-6 wk (scenario-dependent)     │                 │
   │                             │                 │
   ▼                             │                 │
Phase 3  MANAGER OPERATIONS      │                 │
~3-4 wk                          │                 │
   │                             │                 │
   ├─────────────────────────────┘                 │
   │                                               │
   ▼                                               ▼
Phase 4  ODOO INTEGRATION            Phase 5  MOBILE ATTENDANCE
~4-5 wk (when Odoo ready)            ~5-6 wk        │
   │                                                ▼
   │                                 Phase 6  FACIAL VERIFICATION
   │                                 ~4-6 wk (gated by U9, U13)
   │                                                │
   └────────────────┬───────────────────────────────┘
                    ▼
         Phase 7  SCHEDULING & OVERTIME (ADVANCED)   ~4-5 wk
                    │
                    ▼
         Phase 8  FEEDBACK & BRANCH OPERATIONS       ~2-3 wk
```

**First production value:** end of Phase 2 — real attendance captured from
existing hardware, with corrections and audit. Phases 0–2 are the critical path.

---

# Phase 0 — Foundation

### Objective

Replace the parts of the existing application that cannot carry a second domain,
without changing any customer-visible behaviour. At the end, the feedback system
works exactly as it does today, but on an identity model, authorisation layer,
API surface and job runner capable of supporting attendance.

### Dependencies

- **U15 resolved** — runtime decision (containers vs Vercel + hosted worker).
  Blocks the worker foundation. Recommend containers; the Docker path in-repo
  already works and Scenario B (§7.2) would force it anyway.

### Deliverables

**Identity and access**
- `User`, `RoleAssignment`, `Session`, `UserDevice` models.
- `AdminUser` migrated → `User` + `RoleAssignment{SUPER_ADMIN, GLOBAL}`,
  `passwordHash` preserved. Nobody loses access.
- `can(actor, action, resource)` authorisation with `GLOBAL|REGION|BRANCH` scope
  resolution, enforced in repositories — not in page components.
- Stateful sessions with server-side revocation and `sessionVersion`.
- MFA for `SUPER_ADMIN` / `HR` / `ADMINISTRATOR`.

**Structure**
- `lib/modules/<domain>/` layout; feedback logic moved out of pages into
  `lib/modules/feedback/`. ESLint rule forbidding cross-module imports except via
  each module's public `index.ts`.
- `/api/v1` scaffold: bearer auth, refresh-token rotation, versioning, typed
  response envelope, consistent error taxonomy.

**Platform services**
- `AuditLog` with `UPDATE`/`DELETE` revoked from the app role at the DB level.
- **Postgres-backed** `Job` table + worker entrypoint using
  `FOR UPDATE SKIP LOCKED`. No Redis, in this or any later phase
  ([ADR 0002](./decisions/0002-no-redis.md)).
- `SyncOutbox` table and writer (unused until Phase 4, but the transactional
  write path must exist before anything produces syncable records).
- Rate limiting: replace `lib/platform/rate-limit.ts`'s in-memory `Map` with
  the layered design in ADR 0002 — edge protection, a free per-instance
  pre-filter, and an authoritative Postgres counter. **This is a live bug on a
  public endpoint, not a new feature** (architecture §1, problem 1).
- Structured logging + error tracking (Sentry or equivalent).

**Branch and employee groundwork**
- `Branch` extended: `latitude`, `longitude`, `geofenceRadiusMeters`,
  `maxAcceptableAccuracyMeters`, `geofenceEnabled`, `timezone`, `odooBranchId?`.
  Nullable; nothing consumes them yet.
- `Employee` with `masterSource: LOCAL|ODOO` and nullable `odooEmployeeId`
  — **created now specifically so the Odoo ownership transfer (architecture
  §14.2) is possible later.** Retrofitting identity ownership after employee
  records exist is materially harder.

**Cleanups (small, non-blocking)**
- Move `SAMPLE_BRANCHES` out of `lib/constants.ts` into a seed-only fixture.
- Fix the `West-hills-mall` slug — it violates the app's own `branchSlugSchema`.
- Move `sendFeedbackNotification` off the request path onto the job runner.

### Database changes

```
NEW      users · role_assignments · sessions · user_devices
         employees · employee_branch_assignments
         audit_logs (append-only, DB-enforced)
         jobs · sync_outbox
MODIFY   branches   + geo, timezone, odoo mapping (all nullable)
MIGRATE  admin_users → users + role_assignments; then retain admin_users
         read-only for one release before dropping
UNCHANGED questions · feedback_submissions · feedback_answers
INDEX    role_assignments(userId), (scopeType, scopeId)
         jobs(status, runAt) · sync_outbox(status, nextAttemptAt)
         audit_logs(entityType, entityId, createdAt)
```

### Backend changes

- `lib/auth/dal.ts` — `requireAdmin()` kept as a thin wrapper over the new
  `can()` for one release, then removed. Preserves the existing
  proxy-optimistic/DAL-authoritative pattern, which is correct and stays.
- `proxy.ts` matcher extended for `/api/v1/*` and `/api/device/v1/*`.
- Existing Server Actions (`lib/branches/actions.ts`, `lib/questions/actions.ts`,
  `lib/auth/actions.ts`) refactored to call module services instead of Prisma
  directly. Signatures unchanged — the admin UI does not change.
- Worker entrypoint (`worker/index.ts`) sharing the same domain modules.

### Frontend changes

- Admin nav becomes role-driven (`components/admin/admin-nav.tsx`).
- Role management UI (Super Admin only).
- No change to `/feedback` or the public flow.

### Infrastructure

- Runtime per [ADR 0001](./decisions/0001-runtime-topology.md): Vercel keeps the
  web app and API; the worker runs as a separate long-running service from this
  repo. `docker-compose.yml` gains a `worker` service reusing the existing image
  and `docker/start.sh` pattern — the container path stays working whether or
  not it is the deployed one.
- **CI builds the Docker image on every PR.** Portability that is never
  exercised rots silently; a broken container build must fail like a broken test.
- Managed Postgres, reached through a plain `DATABASE_URL`. No provider-specific
  driver or adapter.
- Error tracking wired.
- **No Redis. No object storage.** Neither has a consumer, and Redis never will
  ([ADR 0002](./decisions/0002-no-redis.md)).

### Security considerations

- Session revocation on password change, role change, and termination.
- MFA enrolment for privileged roles.
- `AuditLog` append-only enforced by database grants, not application code.
- Fix the broken rate limiter before anything else touches an endpoint.
- Least-privilege DB role for the application.

### Testing

- Unit: `can()` matrix across every role × scope × action combination.
- Unit: session issue / verify / revoke / version-bump.
- **Integration against a real Postgres** (new capability — current tests mock
  Prisma entirely). Testcontainers or a compose-provided test DB.
- Migration test: `AdminUser` → `User` on a copy of production data.
- Regression: full existing feedback suite must pass unchanged.

### Acceptance criteria

- [ ] Existing admins log in with existing credentials; the feedback dashboard is
      byte-for-byte unchanged in behaviour.
- [ ] `/feedback` and every existing branch QR URL work identically.
- [ ] A `BRANCH_MANAGER`-scoped user cannot read another branch's data through
      any route, including by manipulating URL parameters.
- [ ] Rate limiting holds across two concurrent app instances.
- [ ] A job enqueued in a request is executed by the worker process.
- [ ] Audit rows are written for every mutation; `UPDATE`/`DELETE` on
      `audit_logs` is rejected by the database for the app role.
- [ ] Revoking a session denies access on the next request.

### Can it be deployed independently?

**YES — and it must be.** Phase 0 ships to production with zero user-visible
change. That is precisely what makes it safe: the foundation is validated
against real traffic before any attendance feature depends on it. Deploy behind
no flag; there is nothing new to flag.

---

# Phase 1 — Attendance Core

### Objective

A complete, correct attendance engine that works with **no mobile app, no
fingerprint device, no face recognition and no Odoo**. At the end, attendance can
be recorded (via API and manager entry), projected into days, corrected, and
audited. Everything after this phase is a new provider or a new consumer.

### Dependencies

- Phase 0 complete.
- **U5, U6** — employee data source identified and loadable.
- **U7** — payroll rules: overtime threshold, break policy, grace periods,
  rounding. *These cannot be guessed; a wrong calculation is a payroll incident.*
- **U14** — confirm all branches are Africa/Accra.

### Deliverables

**Engine**
- `ProviderAdapter` interface + ingest pipeline (architecture §6.1).
- `ManualProvider` and `SystemProvider` implemented. `MobileProvider` and
  `FingerprintProvider` are registered stubs — proving the abstraction holds
  before either is built.
- Three-axis assurance model (§6.2) computed per event.
- Per-provider time authority with `occurredAt` / `sourceReportedAt` /
  `recordedAt` / `clockSkewMs` (§6.3).
- Server-side direction state machine (§6.4).
- Cross-provider dedup with `SUPERSEDED` retention (§6.5).
- Idempotency on `(providerType, externalEventId | idempotencyKey)` — modelled
  directly on the existing `POST /api/feedback` pattern.
- `QuarantinedEvent` path for unmapped/malformed input. **Never guess, never
  drop.**

**Projection**
- `AttendanceDay` as a pure function of events + corrections + schedule +
  policy snapshot. Recomputable at any time.
- Auto-close of missing clock-outs: at `scheduledEnd`, **zero overtime**,
  flagged `NEEDS_REVIEW`.
- Late-arriving event handling → re-settlement.

**Minimum viable scheduling** *(moved from Phase 7 — see D6)*
- `Shift` templates; direct `EmployeeShiftAssignment` (effective-dated);
  `ScheduleException`.
- `workDate` anchoring from scheduled start, `crossesMidnight`, 18-hour
  clock-out matching window.
- Resolution order: exception → assignment → branch default → `UNSCHEDULED`.
- **Not in this phase:** rotas/patterns, pre-authorised overtime, partial
  approval, disputes. Those are Phase 7.

**Corrections and audit**
- Typed operations: `ADJUST_TIME`, `INSERT_EVENT`, `VOID_EVENT`,
  `REASSIGN_BRANCH` (§9). Append-only; second-level approval above threshold.
- Full audit on every event, correction and approval.

**Employee data**
- HR employee CRUD + CSV import.
- `EmployeeBranchAssignment` many-to-many (relief/cover staff from day one —
  retrofitting is painful).

### Database changes

```
NEW    attendance_events (append-only, DB-enforced)
       event_evidence          ← separate: sparse, provider-specific, purgeable
       attendance_days
       attendance_corrections (append-only)
       quarantined_events
       shifts · employee_shift_assignments · schedule_exceptions
       employee_device_identities   ← empty until Phase 2, modelled now
INDEX  attendance_events(employeeId, occurredAt)
       attendance_events(deviceId, occurredAt)
       attendance_days(branchId, workDate) · UNIQUE(employeeId, workDate)
       partial attendance_days(status) WHERE status IN ('NEEDS_REVIEW','DISPUTED')
GRANT  revoke UPDATE/DELETE on attendance_events from the app role
```

### Backend changes

- `lib/modules/attendance/` — engine, providers, projection, corrections.
- `lib/modules/scheduling/` — resolution and `workDate` anchoring.
- `POST /api/v1/attendance/events` (provider-agnostic ingest).
- `POST /api/v1/attendance/manual` (manager entry, approval-gated).
- Worker jobs: `project-attendance-day`, `auto-close-missing-clockouts`,
  `resettle-day`.
- **Reuses `lib/date.ts` unchanged** — the Accra day/week helpers are exactly
  what `workDate` anchoring needs and are already correct and tested.

### Frontend changes

Minimal and deliberately internal — the manager experience is Phase 3.
- Admin-only attendance event browser (raw list, all sources, assurance visible).
- Employee CRUD and CSV import UI.
- Basic shift template + assignment UI.
- **Reuses** `StatCard`, `charts.tsx` bucketing, table and filter components from
  `components/admin/`.

### Infrastructure

None new. Postgres + worker from Phase 0.

### Security considerations

- **Manual entry controls in full from day one** (§7.3): controlled reason codes
  plus mandatory free text, bounded retro window, no self-entry, second-level
  approval above threshold, employee notification, per-manager and per-branch
  rate metrics with HR alerting. This is the zero-verification path and it ships
  first — it needs the strongest controls, not the lightest.
- Append-only enforcement verified by test, not assumed.
- Idempotency verified under concurrent replay.

### Testing

- Unit: projection as a pure function — a large table-driven suite covering
  overnight shifts, missing clock-outs, breaks, corrections, dedup, late events.
- Unit: direction state machine including malformed sequences (in-in-out,
  out-first, duplicate).
- Unit: `workDate` anchoring across midnight boundaries.
- Integration: full ingest → project → correct → re-project against real
  Postgres.
- Property test: **replaying the entire event log reproduces identical
  `AttendanceDay` rows.** This is the single most valuable test in the system —
  it is what makes immutability worth having.
- Concurrency: simultaneous duplicate ingest produces exactly one canonical event.

### Acceptance criteria

- [ ] An attendance event can be ingested via API with no mobile app, no device,
      no Odoo present.
- [ ] A manager can record manual attendance; it is fully audited, notifies the
      employee, and carries `identityAssurance = NONE`.
- [ ] Days project correctly for overnight shifts crossing midnight.
- [ ] Missing clock-outs auto-close with **zero** overtime and a review flag.
- [ ] A correction preserves the original event and both values remain visible.
- [ ] Deleting all `attendance_days` and re-running projection reproduces
      identical rows.
- [ ] Duplicate events from two providers within the dedup window produce one
      canonical and one superseded event, both retained.
- [ ] An unmapped employee reference quarantines rather than guessing or dropping.

### Can it be deployed independently?

**YES.** Deployable with manual entry as the only active provider. Some branches
could run on manual-only while device integration proceeds — though that is a
poor steady state (§7.3) and should be time-boxed if used at all.

---

# Phase 2 — Fingerprint Integration

### Objective

Bring the existing branch terminals online as a first-class attendance provider.
**This is the fastest path to real production value** — the hardware exists, is
already installed, and delivers higher identity and location assurance than the
mobile path (architecture D3).

### Dependencies

- Phase 1 complete.
- **U1 and U2 resolved — hard gate.** No implementation begins before the
  investigation concludes.

### Stage 2a — Investigation *(~1–2 weeks, can start during Phase 0)*

Physical inspection and protocol capture. Produce a written findings document
answering, at minimum:

```
DEVICE           exact model · firmware version · vendor SDK/docs availability
                 unit count per branch · physical/admin access · admin credentials
PROTOCOL         push (device→server HTTP) or poll (server→device TCP/SDK)?
                 can it target an arbitrary host and path?
                 TLS support and cipher suites? certificate validation?
                 authentication beyond a serial number?
                 payload schema · character encoding · batch vs single event
TIME             timestamp semantics (local? UTC? which zone?)
                 NTP support · manual clock setting · observed drift
IDENTITY         device user ID format, stability, and reassignment behaviour
                 existing enrolments — extractable as a mapping list?
                 can employees be pushed TO the device, or is enrolment local-only?
DIRECTION        punch-state buttons present? reliably used by staff in practice?
OFFLINE          buffer capacity · overflow behaviour (FIFO drop? refuse punch?)
                 do buffered events replay with original timestamps?
FEEDBACK         can the server return a message the employee sees?
LIMITS           concurrent connections · rate limits · known firmware defects
NETWORK          internet at branch? static IP? NAT? firewall control?
                 can on-prem hardware be placed and supported?
```

**Output: Scenario A, B or C** (architecture §7.2). This determines hardware
budget, deployment topology and timeline more than any code decision. Effort for
Stage 2b varies roughly 2× between A and B, and Scenario C is a materially
degraded product that should trigger a business conversation, not a workaround.

### Stage 2b — Implementation *(~2–4 weeks, scenario-dependent)*

**Deliverables**
- `FingerprintProvider` adapter implementing the Phase 1 interface —
  **zero engine changes.** If the engine needs modification, the Phase 1
  abstraction was wrong and that is the finding.
- `Device` registration, per-device credentials, `DeviceHealthCheck`.
- `EmployeeDeviceIdentity` mapping + import tool for existing enrolments +
  reconciliation report.
- Ingest endpoint `/api/device/v1/events`, hardened and separately rate-limited.
- Clock-drift probe job; skew recorded per event; flag past threshold, quarantine
  past hard limit.
- Backfill handling: late events re-settle already-projected days.
- **Scenario B only:** on-prem Branch Agent — small containerised service,
  local buffering, HTTPS uplink, remote health reporting, unattended restart,
  provisioning and update procedure.

### Database changes

```
NEW    devices · device_health_checks
POPULATE employee_device_identities (modelled in Phase 1)
INDEX  UNIQUE(deviceId, deviceUserId) · devices(serialNumber) UNIQUE
       device_health_checks(deviceId, checkedAt)
```

### Backend changes

- `lib/modules/devices/` — registration, credentials, health, drift.
- `lib/modules/attendance/providers/fingerprint.ts`.
- Worker jobs: `device-health-probe`, `device-clock-drift-check`,
  `device-poll` (Scenario B).

### Frontend changes

- Admin: device registry, health dashboard, drift and last-seen indicators.
- Admin: employee↔device-user mapping UI with an unmapped-ID queue.
- Quarantine review queue.

### Infrastructure

- **Scenario A:** ingest endpoint only.
- **Scenario B:** per-branch hardware, provisioning runbook, remote monitoring,
  field-support process. *Materially larger programme.*
- **Scenario C:** scheduled import job + operational file-handling procedure.
- Network changes at branches per U2.

### Security considerations

- **Treat all device input as hostile** — strict schema validation, per-device
  credential, IP allowlist where topology permits, aggressive rate limiting,
  quarantine on anomaly.
- Where terminal TLS is weak or absent, the on-prem agent becomes the TLS uplink
  and credential holder — **this alone can justify Scenario B even when A is
  technically available.**
- **Fingerprint templates stay on the terminals.** We do not extract, store or
  centralise them. Document this as an explicit decision — it materially reduces
  the biometric compliance surface (architecture §11, §18).
- Mis-mapped device IDs silently pay the wrong person: mapping changes are
  audited and alerted.
- Terminal enrolment removal added to the offboarding checklist.

### Testing

- Device protocol simulator for CI — replaying captured real payloads.
- Malformed, replayed, out-of-order and clock-skewed payload handling.
- Buffer-replay: a day of buffered events arriving at once.
- Unmapped device user → quarantine, never guess.
- **On-hardware acceptance test at one branch before any rollout.**
- Scenario B: agent restart, network partition, buffer overflow behaviour.

### Acceptance criteria

- [ ] A real punch on a real terminal appears as an `AttendanceEvent` with
      correct employee, branch, device, direction and assurance profile.
- [ ] Device clock drift is measured, recorded per event, and alerts past
      threshold.
- [ ] Unmapped device user IDs quarantine and surface in a review queue.
- [ ] Events buffered during a network outage replay correctly and re-settle
      affected days.
- [ ] Device-reported punch state disagreeing with derived direction is flagged,
      not obeyed.
- [ ] **The engine required no modification to accept this provider.**
- [ ] One branch runs on real hardware for two weeks with reconciliation against
      the legacy process before wider rollout.

### Can it be deployed independently?

**YES — per branch.** Roll out branch by branch; unconverted branches continue on
manual entry. This is the strongest argument for the provider abstraction: the
rollout unit is a branch, not a release.

---

# Phase 3 — Manager Operations

### Objective

Give branch managers a daily operational surface. This is the role the platform
lives or dies on — if managers do not adopt it, attendance data degrades
regardless of technical quality.

### Dependencies

- Phase 1 (requires scheduling, hence D6).
- Phase 2 strongly preferred — a manager dashboard with only manual entries has
  little to manage.

### Deliverables

- **Live branch view:** who is in, who is late, who has not clocked out.
- **Exceptions queue:** missing clock-outs, geofence-ambiguous, device drift,
  quarantined events, unscheduled attendance, superseded duplicates.
- **Manual entry UI** over the Phase 1 API, with the full control set visible to
  the manager (reason code, notification notice, approval requirement).
- **Corrections UI** — typed operations, before/after preview, mandatory reason,
  approval routing above threshold.
- **Overtime awareness** — calculated and visible; the approval *workflow* is
  Phase 7.
- **Branch reporting:** attendance rate, lateness trend, hours by employee,
  exception rate, manual-entry rate, device health.
- **Employee self-service (web, read-only):** own attendance with source and
  assurance shown; raise a dispute.
- **HR oversight:** manual-entry and correction rates per branch and per manager,
  with anomaly alerting.

### Database changes

```
NEW    attendance_disputes
MODIFY attendance_days + lowestAssurance (indexed) for review routing
```

### Backend changes

- `lib/modules/attendance/queries/` — branch-scoped, authorisation-enforced.
- `/api/v1/manager/*` endpoints.
- Notification jobs: manual entry, correction, dispute state changes.
- **Reuses `lib/analytics.ts` bucketing** (`bucketTrend`, `bucketScores`,
  gap-filled series) for attendance reporting — same shape, new dataset.

### Frontend changes

- New route group `app/(operations)/branch/*` reusing the existing admin shell,
  `AdminNav` (now role-driven), `StatCard`, `charts.tsx`, table and filter
  components.
- **Phone-first for the exceptions and approvals screens.** A branch manager is
  standing on a restaurant floor, not sitting at a desk. This is the most likely
  place for adoption to fail.
- Source and assurance rendered per the corrected table shape (architecture §8) —
  event verification separate from day lifecycle; manual entries visually
  distinct at a glance.

### Infrastructure

None new.

### Security considerations

- Branch scoping enforced in repositories; verified by test against URL
  manipulation.
- No self-approval, no self-entry.
- Manual-entry and correction rate anomaly alerting live from day one — this is
  the detective control that makes the permissive manual path acceptable.

### Testing

- Authorisation matrix: every manager route × every scope.
- E2E: manager records manual attendance → employee notified → HR metric moves.
- E2E: correction with approval routing.
- Cross-branch access denial, including direct URL manipulation.

### Acceptance criteria

- [ ] A branch manager sees only their branch, through every route.
- [ ] Exceptions surface within one minute of occurring.
- [ ] Manual entry requires a reason code, notifies the employee, and appears in
      HR metrics.
- [ ] Corrections show before/after with attribution and reason.
- [ ] An employee sees the source and assurance of their own events.
- [ ] The exceptions screen is usable one-handed on a phone.

### Can it be deployed independently?

**YES.** Pure read/write UI over existing Phase 1–2 capabilities.

---

# Phase 4 — Odoo Integration

### Objective

Synchronise approved attendance to Odoo and adopt Odoo as the employee master —
**without the platform ever depending on Odoo at runtime.**

### Dependencies

- Phase 1 (records to sync).
- **U3 — Odoo API contract agreed.** Non-negotiable asks: idempotency key
  support; an error taxonomy separating retryable from permanent; a sandbox;
  documented `hr.attendance` field semantics; defined amendment behaviour against
  a closed payroll period.
- **U4 — Odoo readiness.** Externally gated; hence a parallel track, not a
  sequential phase (D13).

### Deliverables

**Employee ownership transfer** *(architecture §14.2 — the largest gap in the
original assumptions)*
- Stage 2 adoption: pull Odoo employees → candidate matching → **HR review queue**
  for match / link / create-new. **Never auto-match on name alone.**
- Per-field authority transfer; `masterSource` flips `LOCAL` → `ODOO` on link.
- Unmatched records in either direction surfaced, never silently resolved.
- Explicit business decision on historical attendance backfill.

**Sync**
- Outbox drain worker: backoff with jitter, circuit breaker, dead letter, replay
  UI.
- Sync states `PENDING | RETRYING | SYNCED | FAILED | REQUIRES_REVIEW`, with
  `REQUIRES_REVIEW` as a **human queue with a named owner and an SLA** — HR for
  data problems, Admin for mapping. Without both it silently accumulates.
- Idempotency: outbox key + `OdooSyncRecord` mapping + a unique field Odoo-side.
  Query-before-retry fallback only if idempotency cannot be provided.
- Amendment path for post-sync corrections; closed-period rejection routes to
  `REQUIRES_REVIEW`, never infinite retry.
- Inbound employee sync: webhook if offered, **polling by design**, nightly full
  reconciliation regardless.
- **Termination triggers same-day platform access revocation** — this makes the
  inbound path a security control, not merely a data feed.
- Nightly reconciliation diff + drift dashboard + alerting on outbox depth and
  oldest-pending age.

### Database changes

```
POPULATE sync_outbox (created Phase 0)
NEW      odoo_sync_records · odoo_employee_match_queue
MODIFY   employees.odooEmployeeId populated; masterSource transitions
```

### Backend changes

- `lib/modules/odoo/` — client, mappers, outbox drain, pull sync,
  reconciliation. **Fully isolated behind an adapter interface**; the attendance
  engine has no knowledge of it.
- Feature flag: Odoo entirely disabled → outbox accumulates or is skipped, and
  nothing else in the platform is aware.

### Frontend changes

- Admin: sync monitoring — queue depth, failures, dead letters, manual replay.
- Admin: reconciliation drift report.
- HR: employee match/adoption queue.

### Infrastructure

- Odoo credentials in a secret manager, rotatable without redeploy, one per
  environment.
- Sandbox connectivity.
- Sync alerting.

### Security considerations

- Server-only calls; never from a client.
- **Verification evidence — GPS, face scores, biometric data — never sent to
  Odoo.** Containing biometric data to one system is the most effective way to
  limit compliance surface.
- Full request/response audit with secrets redacted.
- Amendments, never silent mutation of synced records.

### Testing

- Contract tests against the Odoo sandbox.
- Outbox: retry, backoff, circuit breaker, dead letter, replay.
- **Partial-failure simulation: Odoo commits, response is lost.** Assert no
  duplicate on retry (architecture §14.4). This is the highest-value test in the
  phase.
- Reconciliation detects injected drift.
- Employee matching: exact, fuzzy, ambiguous, and no-match cases.

### Acceptance criteria

- [ ] Attendance is captured, projected and approved normally with **Odoo
      switched off entirely**.
- [ ] Approved records sync; `externalRef` is stored.
- [ ] Odoo down for 24h: outbox accumulates, drains on recovery, **zero
      duplicates, zero employee-visible impact**.
- [ ] A lost response on a committed Odoo write does not create a duplicate.
- [ ] Business rejections route to `REQUIRES_REVIEW`, not endless retry.
- [ ] Reconciliation detects an artificially introduced mismatch.
- [ ] Employee adoption links records through explicit HR review, never
      auto-matching on name.
- [ ] A termination in Odoo revokes platform access the same day.

### Can it be deployed independently?

**YES**, behind a feature flag, and it is designed to be *absent* indefinitely.
This is the architectural claim the phase exists to prove.

---

# Phase 5 — Mobile Attendance

### Objective

An employee mobile app as a second first-class provider — extending coverage and
audit richness beyond what the terminals provide.

### Dependencies

- Phases 1 and 3.
- **U10** — real branch coordinates and realistic radii.
- **U11** — employee smartphone ownership and data cost. *May materially change
  this phase's priority or scope.*

### Deliverables

- React Native (Expo) app: auth with refresh rotation, device registration,
  branch assignment, clock in/out, own attendance history with source and
  assurance, own schedule, offline queue.
- `MobileProvider` adapter — again, **no engine changes.**
- Challenge/nonce endpoint: single-use, 60s TTL, bound to user + device.
- Geofence evaluation server-side, three-state (§10); client preview advisory
  only.
- Device attestation: Play Integrity / App Attest.
- Mock-location detection, teleport and jitter plausibility checks.
- Offline queue with server-issued nonce, flagged `DEFERRED_OFFLINE`.
- Push notifications.
- Branch geofence editor with map picker (admin web).

### Database changes

```
POPULATE user_devices · event_evidence (geo columns)
MODIFY   branches — geo fields become required for geofence-enabled branches
```

### Backend changes

- `lib/modules/attendance/providers/mobile.ts`.
- `POST /api/v1/attendance/challenge`, `POST /api/v1/attendance/clock`.
- `lib/services/geofence.ts` — Haversine, three-state, snapshot-on-event.
- Attestation verification service.

### Infrastructure

- **No new datastore.** Nonces are a Postgres table, consumed in the same
  transaction as the attendance event — which is *why* they are not in Redis
  ([ADR 0002](./decisions/0002-no-redis.md)): a two-system commit on the
  clock-in path cannot be made atomic, and Redis being down must never stop
  someone clocking in.
- Object storage via an **S3-compatible API** (R2 / S3 / MinIO), never Vercel
  Blob — same SDK, swappable endpoint.
- App Store / Play Store accounts, signing, CI for mobile builds.
- Maps provider for the geofence editor.
- Push infrastructure (FCM/APNs).

### Security considerations

- Attestation gates clock-in; failure refuses or flags per policy.
- Certificate pinning; no secrets in app storage.
- 15-minute access tokens with rotating refresh.
- Device binding — one active device per employee; re-binding audited and
  alerted.
- Geofence snapshot on every event so radius changes cannot rewrite history.
- **GPS is evidence, not a gate** (§10). Where an employee also uses the branch
  terminal, physical presence is already proven and GPS adds little.

### Testing

- Geofence three-state boundary tests across accuracy ranges.
- Nonce single-use, expiry, cross-device rejection.
- Offline queue: capture → airplane mode → reconnect → correct submission.
- Attestation failure paths.
- Duplicate suppression when the same employee also punches the terminal.
- Device-farm testing across low-end Android — realistic for this workforce.

### Acceptance criteria

- [ ] Clock-in inside the geofence succeeds; outside is rejected with a clear
      reason; ambiguous accepts and flags.
- [ ] Clock-out outside the geofence **always succeeds** and is flagged.
- [ ] A replayed request is rejected by nonce consumption.
- [ ] Offline capture submits correctly on reconnect and is flagged.
- [ ] Mock location is detected and flagged.
- [ ] Terminal punch + app clock-in within the window produce one canonical
      event, both retained.
- [ ] The engine required no modification to accept this provider.

### Can it be deployed independently?

**YES**, and per employee — pilot with a small group while everyone else
continues on terminals.

---

# Phase 6 — Facial Verification

### Objective

Raise mobile identity assurance from `DEVICE_BOUND` to `BIOMETRIC`.
**Strictly optional.** Everything else works without it; disabling it lowers one
assurance axis and changes nothing structurally.

### Dependencies

- Phase 5.
- **U9 — Ghana Data Protection Act (Act 843) review complete, DPIA done, consent
  mechanism agreed. HARD GATE: no enrolment before legal sign-off.** Start this
  track during Phase 1.
- **U13 — vendor selected, with demographic accuracy validated on a real
  cross-section of Basilissa staff.**

### Deliverables

- In-person, dual-signed, audited enrolment by HR/manager. **Never
  self-service** — whoever enrols a face controls that identity.
- On-device detection, quality gating, liveness capture.
- Server-side embedding, matching and decision.
- `EmployeeBiometricTemplate` — dedicated table, dedicated KMS key, never logged,
  never in an API response, never sent to Odoo.
- Reference photo in private object storage behind short-lived signed URLs; access
  itself audited.
- Retention and purge jobs, with a tested deletion path.
- **Fallback path**: after N failures → `PENDING_VERIFICATION` clock-in, recorded,
  flagged, manager-confirmed. **Never blocks work** (principle P6).
- Similarity score logged on every attempt for threshold tuning.
- Non-biometric alternative documented and available — already satisfied by the
  terminals and manual entry, which makes the consent position defensible.

### Database changes

```
NEW      employee_biometric_templates (encrypted, separate access policy)
         employee_profile_photos
MODIFY   event_evidence + faceScore, faceThreshold, faceModelVersion,
         livenessResult, capturedFrameKey, retentionExpiresAt
```

### Infrastructure

- Face engine: self-hosted inference service (in-region, no vendor lock-in on
  unmigratable data) or managed API (faster, but exports biometric data abroad —
  requires legal sign-off).
- **Object storage enters here** — S3/R2 + KMS.
- Liveness SDK licence if commercial.

### Security considerations

- Templates encrypted with a dedicated key, separate from application data.
- Captured frames purged within days; deletion verified, not assumed.
- Enforced purpose limitation: clock-in/out only. No surveillance, no matching
  against feedback footage, no third-party sharing.
- Enrolment and re-enrolment audited **and alerted** — silent re-enrolment
  defeats every other control in the architecture.
- Documented breach-response plan. **Biometrics cannot be reissued.**

### Testing

- Spoofing: printed photo, screen replay, video.
- **Accuracy validation across a real cross-section of Basilissa staff** —
  demographic performance is a documented, non-hypothetical risk (architecture
  §11).
- Fallback path when verification fails legitimately.
- Retention purge verified end-to-end.
- Template encryption at rest verified.

### Acceptance criteria

- [ ] Legal sign-off and DPIA complete **before any enrolment**.
- [ ] Face verification can be disabled by configuration; attendance continues.
- [ ] Failed verification never prevents an employee from starting work.
- [ ] Templates are absent from logs, API responses, and Odoo payloads.
- [ ] Retention purge demonstrably deletes expired frames.
- [ ] Accuracy validated on real staff before rollout, with results documented.

### Can it be deployed independently?

**YES**, per employee and behind configuration.

---

# Phase 7 — Scheduling & Overtime (Advanced)

### Objective

Complete the workforce layer on top of Phase 1's minimum viable scheduling.

### Dependencies

- Phase 1 (foundation), Phase 3 (approval UI).
- **U7, U8** — payroll and overtime policy confirmed in writing.

### Deliverables

- `ShiftPattern` / `ShiftPatternDay` rotas; pattern assignment with effective
  dating; rota builder UI.
- Break events and policies (explicit punches or automatic unpaid deduction),
  per branch.
- `PreAuthorizedOvertime` windows with auto-approval on completion.
- Overtime approval workflow: threshold, queue, partial approval with mandatory
  reason, rejection, escalation SLA, no self-approval.
- Dispute workflow with HR escalation.
- Overtime and hours reporting; payroll-period export.

### Database changes

```
NEW    shift_patterns · shift_pattern_days · pre_authorized_overtime
       overtime_requests
MODIFY employee_shift_assignments → pattern-based (additive; direct assignment
       from Phase 1 retained)
       attendance_days + payableOvertimeMinutes
```

### Backend changes

- `lib/modules/overtime/` — calculation, approval state machine, escalation.
- Extend scheduling resolution for patterns.
- Worker: escalation timers, approval reminders.
- Outbox now emits overtime alongside attendance.

### Frontend changes

- Rota builder (web).
- Overtime approval queue — **phone-usable**.
- Employee: OT status and history in the mobile app.
- Dispute raise and track.

### Security considerations

- No self-approval, enforced in the domain layer.
- Approval decisions audited with mandatory reasons on partial and reject.
- Escalation prevents silent indefinite pending — the origin of most payroll
  disputes.

### Testing

- Overtime calculation against the confirmed policy, table-driven.
- Pre-authorisation windows and boundaries.
- Partial approval arithmetic and notification.
- Escalation timing.
- Self-approval attempts rejected.

### Acceptance criteria

- [ ] Rotas generate correct scheduled times including overnight shifts.
- [ ] Overtime below threshold is not raised for approval.
- [ ] Pre-authorised overtime auto-approves with an audit entry.
- [ ] Partial approval records both calculated and approved minutes and notifies
      the employee of the delta.
- [ ] A manager cannot approve their own overtime.
- [ ] Pending overtime escalates on schedule.

### Can it be deployed independently?

**YES.** Phase 1's simple scheduling continues working; patterns are additive.

---

# Phase 8 — Feedback & Branch Operations

### Objective

Complete the platform by connecting the existing feedback system to operational
data.

**Smaller than it appears** (architecture D12): role-scoped feedback access falls
out of Phase 0's RBAC work for free. The genuinely new work here is combined
reporting.

### Dependencies

- Phases 0 and 3.

### Deliverables

- Branch managers see their own branch's feedback — largely already true after
  Phase 0.
- **Combined operational dashboard**: staffing levels against service ratings,
  attendance exceptions against feedback dips, per-branch operational scorecard.
  This is the actual product value and the reason for one platform.
- Cross-module reporting and exports.
- Notification centre consolidating email, push and in-app.
- Optional: per-branch feedback questions (requires `Question.order` →
  `UNIQUE(branchId, order)`).

### Database changes

```
MODIFY (optional) questions.order → UNIQUE(branchId, order), branchId nullable
NEW    notifications (if not delivered in Phase 3)
```

### Backend changes

- `lib/modules/reporting/` — cross-module aggregation.
- **Reuses `lib/analytics.ts` almost entirely**; the bucketing functions already
  produce the right shape.

### Frontend changes

- Unified branch dashboard.
- Report builder / export.

### Security considerations

- **The public feedback flow stays fully decoupled from employee auth** — no
  shared middleware, no session dependency, no path by which employee data can
  leak into an anonymous route.
- Cross-module queries respect branch scope.

### Testing

- **Regression: every existing feedback test still passes.**
- Existing QR URLs resolve identically.
- Cross-module report scoping.

### Acceptance criteria

- [ ] Every existing branch QR code works unchanged.
- [ ] `/feedback` remains anonymous and unauthenticated.
- [ ] A branch manager sees their branch's feedback and attendance on one screen.
- [ ] No employee data is reachable from any public route.

### Can it be deployed independently?

**YES.** Additive reporting over existing data.

---

# Parallel Tracks

Four investigation and design tracks run alongside the build. Three of them gate
later phases and should start immediately.

```
                    ┌────────────────────────────────────────────┐
   PHASE 0          │  FOUNDATION (blocking — nothing bypasses)  │
   weeks 1-4        └───────────────────┬────────────────────────┘
                                        │
        ┌───────────────┬───────────────┼───────────────┬─────────────────┐
        ▼               ▼               ▼               ▼                 ▼
   ┌─────────┐   ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐
   │ BUILD   │   │ TRACK A    │  │ TRACK B    │  │ TRACK C    │  │ TRACK D      │
   │         │   │ Device     │  │ Odoo API   │  │ Mobile UX  │  │ Legal / DPIA │
   │ Phase 1 │   │ investig.  │  │ contract   │  │ + API      │  │ Act 843      │
   │ Attend. │   │ (U1, U2)   │  │ (U3, U4)   │  │ contract   │  │ (U9)         │
   │ Core    │   │            │  │            │  │            │  │              │
   │         │   │ 1-2 weeks  │  │ negotiation│  │ ~1 week    │  │ LONG LEAD    │
   │ 4-5 wk  │   │ physical   │  │ external   │  │ design +   │  │ start NOW    │
   │         │   │ inspection │  │ dependency │  │ contract   │  │              │
   └────┬────┘   └──────┬─────┘  └──────┬─────┘  └──────┬─────┘  └───────┬──────┘
        │               │               │               │                │
        └───────┬───────┘               │               │                │
                ▼                       │               │                │
          ┌──────────┐                  │               │                │
          │ Phase 2  │                  │               │                │
          │ Finger-  │                  │               │                │
          │ print    │                  │               │                │
          └────┬─────┘                  │               │                │
               ▼                        │               │                │
          ┌──────────┐                  │               │                │
          │ Phase 3  │                  │               │                │
          │ Manager  │                  │               │                │
          └────┬─────┘                  │               │                │
               │                        │               │                │
               ├────────────────────────┘               │                │
               ▼                                        │                │
          ┌──────────┐                                  │                │
          │ Phase 4  │  ← starts when Odoo is ready,    │                │
          │ Odoo     │    NOT when Phase 3 ends         │                │
          └──────────┘                                  │                │
               │                                        │                │
               │              ┌─────────────────────────┘                │
               │              ▼                                          │
               │        ┌──────────┐                                     │
               │        │ Phase 5  │                                     │
               │        │ Mobile   │                                     │
               │        └────┬─────┘                                     │
               │             │              ┌──────────────────────────┘
               │             ▼              ▼
               │        ┌─────────────────────┐
               │        │ Phase 6  Face       │  ← HARD GATE on Track D
               │        └──────────┬──────────┘
               │                   │
               └─────────┬─────────┘
                         ▼
                  ┌─────────────┐
                  │ Phase 7 · 8 │
                  └─────────────┘
```

### Track detail

| Track | Start | Owner | Gates | Why parallel |
|---|---|---|---|---|
| **A — Device investigation** | Immediately, during Phase 0 | Backend + ops, on site | Phase 2 entirely | Physical inspection, no code dependency. Determines Scenario A/B/C — the largest cost variance in the programme. |
| **B — Odoo API contract** | Immediately | Tech lead ↔ Odoo team | Phase 4 | External dependency, long lead. Must secure idempotency support before any implementation. |
| **C — Mobile UX + API contract** | After Phase 0 | Frontend + design | Phase 5 | Design and contract can be settled while the engine is built; parallelises the mobile build. |
| **D — Legal / DPIA (Act 843)** | Immediately | Business + Ghanaian counsel | **Hard gate on Phase 6** | Longest lead item in the programme. Can block face rollout entirely. Starting it late is the most common way this kind of feature dies. |

### Parallelisable within the build

- Phase 1 engine and Phase 1 employee CRUD/import are independent.
- Phase 2 Stage 2a (investigation) overlaps Phase 1 entirely.
- Phase 3 UI can begin against Phase 1 APIs before Phase 2 completes.
- Phase 5 mobile app scaffolding overlaps Phase 4.
- Phase 7 overtime calculation logic can be written against Phase 1 projections
  before its UI exists.

### Not parallelisable

- **Nothing bypasses Phase 0.** Every subsequent phase depends on identity,
  authorisation, the module layer and the job runner.
- Phase 2 Stage 2b cannot start before Stage 2a concludes — building against an
  assumed protocol is the most likely source of rework in this programme.
- Phase 6 cannot start before Track D concludes.

---

# Risks & Unknowns Gating Each Phase

**No answers are invented below. Each must be established by investigation.**

| ID | Unknown | Gates | Impact if unresolved or wrong |
|---|---|---|---|
| **U1** | Fingerprint terminals: model, firmware, protocol/SDK, push vs poll, TLS, auth mechanism, employee-sync capability, offline buffer size and overflow behaviour, timestamp semantics, clock-sync, bidirectional feedback, connection limits | **Phase 2** | Determines Scenario A/B/C. Roughly 2× effort variance; Scenario C is a materially degraded product requiring a business decision |
| **U2** | Branch network topology: internet, static IP, NAT, firewall control, uptime, ability to site on-prem hardware | **Phase 2** | Forces on-prem agent; adds per-branch hardware, provisioning and field support |
| **U3** | Odoo API contract: protocol, auth, **idempotency support**, error taxonomy, webhooks, sandbox, rate limits, `hr.attendance` mapping, closed-period behaviour | **Phase 4** | No idempotency forces query-before-retry; no sandbox blocks safe testing |
| **U4** | Odoo implementation timeline and readiness | **Phase 4** scheduling | Longer standalone operation raises the importance of local employee mastery (Stage 1) |
| **U5** | Existing terminal enrolments; device user ID stability; where the authoritative employee list currently lives | **Phases 1, 2, 4** | Mis-mapping silently pays the wrong person |
| **U6** | Employee data source quality: count, format, completeness, duplicates | **Phase 1** | Determines import tooling and HR cleanup effort |
| **U7** | Payroll rules: OT rates and thresholds, break policy, grace periods, rounding, pay-period boundaries, public holidays | **Phases 1, 7** | Wrong calculation is a payroll incident, not a bug |
| **U8** | Overtime policy: approval authority, partial rules, escalation SLA, unapproved-but-worked treatment, disputes | **Phase 7** | Workflow shape and legal defensibility |
| **U9** | Act 843 requirements: DPC registration, lawful basis, consent, DPIA, retention, employee notice | **Phase 6 — hard gate** | Can block face rollout entirely. Longest lead item |
| **U10** | Real branch coordinates; realistic radii for mall units | **Phase 5** | Wrong radii cause mass false rejections |
| **U11** | Employee smartphone ownership and data cost across the workforce | **Phase 5** | May invalidate mobile-first assumptions; raises terminal centrality |
| **U12** | Offline requirements: acceptable capture-to-visibility latency, tolerance for delayed exceptions | **Phases 2, 5** | Drives buffering, agent design, manager UX |
| **U13** | Face vendor: demographic accuracy on this workforce, data residency, liveness quality, volume cost | **Phase 6** | Accuracy failure on the actual workforce makes the feature unusable |
| **U14** | All branches Africa/Accra confirmed | **Phase 1** | Multi-country later requires per-branch `workDate` anchoring from the start |
| **U15** | Runtime: containers vs Vercel + hosted worker | **Phase 0** | Blocks the worker foundation; Scenario B likely forces containers |

### Cross-cutting programme risks

| Risk | Mitigation |
|---|---|
| **Phase 0 is cut under delivery pressure** | The most likely failure mode. Without it, "extend the existing system" stops being the right answer and the result is unmaintainable within months. Treat Phase 0 as scope, not overhead. |
| **Device investigation deferred; Phase 2 built on assumptions** | Hard-gate Stage 2b on Stage 2a. Building against an assumed protocol is the most likely source of large rework. |
| **Manual entry becomes the default path** | Deliberate friction, rate metrics, HR alerting, and fast device-fault response. If reporting a broken terminal is harder than manual entry, manual entry wins. |
| **Manager non-adoption** | Phone-first exception and approval screens; pilot with one branch manager in Phase 3 before wider rollout. |
| **Payroll cutover errors** | Parallel run of the existing process alongside the new one for at least one full pay cycle before cutover. Do not skip this. |
| **Scope sprawl into a full HRIS** | Odoo owns payroll and employee master. Hold that line. |

---

# What Is Explicitly Reused, Refactored, Deferred

### Reused unchanged

| Asset | Used for |
|---|---|
| `lib/date.ts` | `workDate` anchoring, overnight shifts, day/week boundaries. Already correct and tested — the single most valuable reusable file for attendance |
| `lib/prisma.ts`, `lib/env.ts`, `lib/utils.ts` | Unchanged |
| Docker / Compose / `docker/start.sh` / healthcheck | Becomes the primary runtime again; extended with a `worker` service |
| `.npmrc` hoisting workaround | Still required for Prisma tracing |
| shadcn/ui + Tailwind v4 theme + brand assets | Entire operations UI |
| Vitest setup | Extended with real-Postgres integration tests |
| Prisma schema conventions (cuid, `@@map`, index discipline, explicit `onDelete`, doc comments) | Applied to every new model |
| `/feedback`, `POST /api/feedback`, `FeedbackFlow`, all feedback models | **Untouched through every phase.** Existing QR codes must work forever |

### Reused with extension

| Asset | Extension |
|---|---|
| `Branch` | Geo, timezone, Odoo mapping, device relations |
| Admin shell — `app/admin/(dashboard)/layout.tsx`, `AdminNav`, `StatCard`, `charts.tsx`, filters, tables | Operations Platform shell; role-driven nav |
| `lib/analytics.ts` bucketing (`bucketTrend`, `bucketScores`, gap-filled series) | Attendance and overtime reporting — same shape, new dataset |
| `lib/validations.ts` | Zod-at-the-boundary discipline extended to every new endpoint |
| `lib/email.ts` | Template extracted from the string literal; sending moved onto the job runner |
| **Idempotency pattern in `POST /api/feedback`** | Generalised into the provider ingest pipeline. The single most directly transferable piece of logic in the codebase |
| `proxy.ts` optimistic-check + `lib/auth/dal.ts` authoritative-check pattern | Pattern retained; the identity model behind it is replaced |

### Refactored or replaced

| Asset | Why |
|---|---|
| `AdminUser` | Cannot express employees, roles or scopes |
| `requireAdmin()` | Binary; replaced by `can(actor, action, resource)` |
| `lib/rate-limit.ts` implementation | In-memory `Map` is already broken on Vercel — a live bug, not a new requirement. Interface retained |
| Server Actions as the only mutation path | Mobile and hardware clients cannot call them; service layer extracted beneath them |
| Stateless-only sessions | No revocation; unacceptable for employees |
| `SAMPLE_BRANCHES` in `lib/constants.ts` | Seed data compiled into the app bundle; worse once branches carry geofences |

### Deliberately deferred

| Item | Until | Why |
|---|---|---|
| **Redis** | **Never** — removed, not deferred | Postgres serves every proposed use (queue, locks, sessions, rate limits, nonces) correctly. Putting nonces in Redis would have made it a *correctness* dependency of clock-in. See [ADR 0002](./decisions/0002-no-redis.md); re-adding requires a new ADR |
| **Object storage** | Phase 5/6 | Nothing to store until profile photos and capture frames exist |
| **PostGIS** | Possibly never | Circles suffice for tens of branches; add only if polygon fences become necessary |
| **Face recognition infrastructure** | Phase 6 | Optional capability; legally gated; must not block attendance |
| **Push notifications** | Phase 5 | Email suffices for manager and HR alerting until an app exists |
| **Per-branch feedback questions** | Phase 8, optional | Cheap schema change now (`UNIQUE(branchId, order)`), no consumer yet |
| **Table partitioning** | When volume justifies | ~290k events/year at ~200 employees. Design the shape, defer the work |
| **Branch kiosk provider** | Future | Less urgent than in Revision 1 — the fingerprint terminals already deliver the presence guarantee a kiosk was proposed to provide |
| **Leave management** | Post-Phase 8 | Odoo owns balances; our module is a request workflow on top |

---

*Prepared against commit `67481f5`. No code or schema has been modified. Architecture
rationale, trade-offs and divergences from the stated assumptions are documented in
the companion [Architecture & Discovery Assessment](./attendance-platform.md).*
