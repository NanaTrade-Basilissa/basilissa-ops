# Basilissa Operations Platform — Architecture & Discovery Assessment

> **Status:** Discovery / architecture proposal. No implementation.
> **Revision:** 2 — 2026-09-05. Revised to incorporate multi-provider attendance
> (mobile, fingerprint, manual), Odoo as a non-blocking ERP integration, and
> capability-independent deployment. Revision 1 assumed a mobile-first,
> Odoo-coupled design; superseded sections are rewritten in place.
> **Companion document:** [Implementation Plan & Phases](./implementation-plan.md)
> **Baseline commit:** `67481f5`

---

## Contents

1. [Current Architecture Assessment](#1-current-architecture-assessment)
2. [Architectural Principles](#2-architectural-principles)
3. [What Can Be Reused](#3-what-can-be-reused)
4. [What Needs to Change](#4-what-needs-to-change)
5. [Recommended Target Architecture](#5-recommended-target-architecture)
6. [The Attendance Engine](#6-the-attendance-engine)
7. [Attendance Providers](#7-attendance-providers)
8. [Attendance Source & Method Tracking](#8-attendance-source--method-tracking)
9. [Immutable Events, Corrections & Audit](#9-immutable-events-corrections--audit)
10. [Geofencing](#10-geofencing)
11. [Facial Verification](#11-facial-verification)
12. [Working Hours Model](#12-working-hours-model)
13. [Overtime & Approval Workflow](#13-overtime--approval-workflow)
14. [Odoo Integration](#14-odoo-integration)
15. [Roles & Permissions](#15-roles--permissions)
16. [Feedback in the Platform](#16-feedback-in-the-platform)
17. [Conceptual Data Model](#17-conceptual-data-model)
18. [Security Risks & Mitigations](#18-security-risks--mitigations)
19. [Client Surfaces: Mobile, Web, Device](#19-client-surfaces-mobile-web-device)
20. [Architecture Decision](#20-architecture-decision)
21. [Divergences from Stated Assumptions](#21-divergences-from-stated-assumptions)
22. [Risks & Open Unknowns](#22-risks--open-unknowns)
23. [Overall Recommendation](#23-overall-recommendation)

---

# 1. Current Architecture Assessment

## What this actually is

A **single-process Next.js 16 monolith** where the "backend" is Next.js itself.
There is no service layer, no API layer for admin functionality, and no
separation between HTTP handling and domain logic — React Server Components call
Prisma directly.

```
                          ┌─────────────────────────────────────┐
                          │  Customer phone (QR scan)           │
                          │  /feedback?branch={slug}            │
                          └────────────────┬────────────────────┘
                                           │ HTTPS
┌──────────────────────────────────────────▼───────────────────────────────────┐
│  Next.js 16 App Router (single container / single Vercel deployment)         │
│                                                                              │
│  proxy.ts  (was middleware.ts)                                               │
│    matcher: /admin/*, /api/admin/*                                           │
│    OPTIMISTIC check only: "does a session cookie exist?"                     │
│    → 302 /admin/login  or  401 JSON.   NOT the security boundary.            │
│                                                                              │
│  ┌────────────────────────┐   ┌──────────────────────────────────────────┐   │
│  │ PUBLIC (no auth)       │   │ ADMIN (cookie session)                   │   │
│  │ /feedback  (RSC)       │   │ /admin              dashboard            │   │
│  │   └ FeedbackFlow       │   │ /admin/branches     CRUD + QR            │   │
│  │     (client, useState) │   │ /admin/questions    CRUD + reorder       │   │
│  │ POST /api/feedback     │   │ /admin/feedbacks    list + filters       │   │
│  │   • in-memory rate lim │   │                                          │   │
│  │   • Zod validate       │   │ Server Components → prisma directly      │   │
│  │   • idempotency token  │   │ Server Actions    → requireAdmin() first │   │
│  │   • tx: submission +   │   │ GET /api/admin/qr, .../branches/[id]/qr  │   │
│  │     answers            │   │                                          │   │
│  └────────────────────────┘   │ lib/auth/dal.ts ← REAL security boundary │   │
│                               │   verifySession() = cache(getSession())  │   │
│  GET /api/health              │   requireAdmin() → redirect if null      │   │
│  (unauth, SELECT 1)           └──────────────────────────────────────────┘   │
│                                                                              │
│  lib/  analytics.ts · date.ts (Africa/Accra) · email.ts · env.ts (Zod)       │
│        prisma.ts (singleton) · rate-limit.ts (in-memory Map) · validations.ts│
└───────────────┬──────────────────────────────────────────┬───────────────────┘
                │ Prisma 6                                 │ HTTPS (blocking)
                ▼                                          ▼
      ┌───────────────────┐                        ┌────────────────┐
      │ PostgreSQL 16     │                        │ Resend (email) │
      │ 5 tables          │                        │ fire-and-forget│
      │ admin_users       │                        │ never throws   │
      │ branches          │                        └────────────────┘
      │ questions         │
      │ feedback_subs     │        NO: object storage, queue, worker,
      │ feedback_answers  │            cron, cache, audit log, RBAC
      └───────────────────┘
```

## Component-by-component

| Area | State today |
|---|---|
| **Frontend** | Next 16 App Router, React 19. Server Components for all data reads; one meaningful client component (`FeedbackFlow`). Tailwind v4 + shadcn/ui (15 primitives) + Base UI + Recharts + sonner. Mobile-first, but browser-only — no PWA manifest, no service worker, no native shell. |
| **Backend** | Doesn't exist as a distinct layer. 4 route handlers total (`/api/feedback`, 2 QR endpoints, `/api/health`). All mutations are Server Actions. Business logic lives inline in pages and actions. |
| **Database** | Postgres 16, Prisma 6, 2 migrations, 5 tables. Genuinely good discipline: cuid PKs, `@@map` to snake_case, deliberate indexes (incl. composite `branchId,submittedAt`), documented `onDelete` semantics, doc comments on every model. |
| **Auth** | Hand-rolled. bcryptjs + `jose` HS256 JWT in an httpOnly/Secure/SameSite=Lax cookie, 8h fixed expiry. Payload is `{adminId, email, name}` — **no role, no scope, no version**. Stateless: **no revocation, no refresh, no session table.** Timing-safe login (dummy hash), per-IP login rate limit. |
| **User/employee concepts** | Only `AdminUser` (id, name, email, passwordHash). No employee entity, no person↔branch relation, no self-service, no password reset. |
| **Roles & permissions** | **None.** `requireAdmin()` is a boolean. Every admin sees and can edit every branch. |
| **Admin functionality** | Dashboard (stat cards, rating distribution, 30-day trend, branch comparison, per-question averages, recent submissions), branch CRUD + activate/deactivate + QR download, question CRUD with 5-active cap and order-swap, feedback list with filters + pagination. All `force-dynamic`. |
| **API structure** | No versioning, no consistent envelope, no OpenAPI, no token auth. Admin "API" is Server Actions — **not consumable by a mobile app or a hardware device.** |
| **Background jobs / workers** | **None.** No queue, no cron, no worker process, no job table. `sendFeedbackNotification` is `await`ed inline in the request path. |
| **Notifications** | Email only. Resend, one hand-built HTML template inlined in `lib/email.ts`, recipients from a comma-separated env var. No per-user routing, no push, no SMS, no in-app. |
| **File/image storage** | **None.** QR PNGs are generated per-request in memory and streamed. No S3/R2/blob client anywhere. |
| **Deployment** | Two paths in-repo. (1) Docker: multi-stage → Next standalone, non-root, `start.sh` runs `prisma migrate deploy` then `node server.js`; compose with Postgres (not host-published), healthchecks, seed profile. (2) Vercel: last commit added `rhel-openssl-3.0.x` and disabled `output: "standalone"` under `VERCEL`. |
| **Integrations** | Resend only. No ERP, no maps, no storage, no device protocols, no observability. |
| **Branch/location** | `Branch { id, name, slug (unique), location: String, isActive }`. `location` is **freeform display text** — no coordinates, no geometry, no timezone, no opening hours. |
| **Testing** | Vitest, 8 files / ~586 lines, node env, Prisma mocked. No DB-backed or E2E tests. |

## Problems found while reading

1. **The in-memory rate limiter is effectively disabled on Vercel.**
   `lib/rate-limit.ts` uses a process-local `Map`, correct for the single-container
   Compose setup it was written for. The last commit moved deployment to Vercel,
   where each invocation may be a fresh isolate. Live issue today.
2. **`await sendFeedbackNotification(...)`** puts an external HTTP call on the
   customer's critical path.
3. **No session revocation.** Tolerable for admins; unacceptable for employees —
   a terminated employee keeps a valid token for up to 8 hours.
4. **`Question.order` is globally unique**, foreclosing per-branch question sets.
5. **No `createdBy`/`updatedBy`/audit anywhere.**
6. **`SAMPLE_BRANCHES` is seed data compiled into the app bundle.** Gets worse
   once branches carry geofences.
7. Minor: uncommitted slug `"West-hills-mall"` violates the app's own
   `branchSlugSchema` regex; the seed bypasses validation by writing via Prisma.

---

# 2. Architectural Principles

These are the constraints every later decision is measured against.

### P1 — Capability independence

The attendance engine must not require the mobile app, facial recognition, the
fingerprint hardware, or Odoo to be operational. Each is an optional capability
that attaches to a stable core. Every one of these must be a valid production
deployment:

```
  v1   Fingerprint ──────────────────► Engine ──► DB
  v2   Fingerprint + Manager ────────► Engine ──► DB
  v3   Fingerprint + Manager ────────► Engine ──► DB ──► Odoo
  v4   Fingerprint + Manager + Mobile ► Engine ──► DB ──► Odoo
  v5   + Face verification ──────────► Engine ──► DB ──► Odoo
```

Capabilities are added by configuration and new adapters, never by rewriting the
core. A capability being absent degrades assurance or convenience — it never
blocks attendance capture.

### P2 — Provider independence, not provider equivalence

Attendance arrives through pluggable providers. The adapter normalises
**transport and employee identification only**. It must not normalise away the
differences in verification strength — those differences are precisely what
payroll disputes and audits depend on. Every event carries an explicit assurance
profile (§6).

### P3 — Odoo is an integration, never a runtime dependency

Attendance is recorded, projected, corrected and approved entirely within the
platform. Synchronisation to Odoo is asynchronous, retried, reconciled, and
observable. Odoo being absent, unbuilt, or down has zero effect on an employee's
ability to clock in.

### P4 — Events are immutable; everything else is derived or additive

Raw attendance events are append-only. Day-level figures are a pure projection.
Corrections are new records. Nothing is ever updated in place or deleted.

### P5 — Trust is explicit and recorded, never implied

Identity, location and time assurance are recorded per event, per provider.
Business rules reference assurance levels, not provider names.

### P6 — Degrade, don't block

Every verification failure path must have a recorded, flagged, human-reviewable
fallback. A system that prevents someone from starting their shift will be worked
around, and then you have neither security nor data.

---

# 3. What Can Be Reused

**Reuse essentially as-is:**

- `lib/date.ts` — Accra-anchored day/week boundary helpers built through `Intl`
  with an explicit timezone. More valuable than it looks: `workDate` anchoring
  and overnight-shift logic depend entirely on this, and it's already correct.
- `lib/prisma.ts`, `lib/env.ts` (Zod-validated, lazily evaluated so builds don't
  need secrets), `lib/utils.ts`.
- Docker/Compose/`start.sh` pipeline, healthcheck endpoint, `.npmrc` hoisting
  workaround for Prisma tracing. **The container path becomes load-bearing again**
  — see §5 on why pure serverless is now disqualified.
- The entire shadcn/ui + Tailwind v4 theme layer and brand assets.
- Vitest setup and the mocked-Prisma testing approach.
- Prisma schema *conventions* — cuid, `@@map`, index discipline, explicit
  `onDelete`, doc comments. Better than most codebases; keep them.

**Reuse with extension:**

- `Branch` — the anchor entity of the whole platform. Add geo, timezone, Odoo
  mapping, device relations.
- Admin shell (`app/admin/(dashboard)/layout.tsx`, `AdminNav`, `StatCard`,
  `charts.tsx`, filter components, tables) — becomes the Operations Platform
  shell; nav becomes role-driven.
- `lib/analytics.ts` bucketing patterns (`bucketTrend`, `bucketScores`,
  gap-filled date series) — directly transferable to attendance reporting.
- `lib/validations.ts` Zod-at-the-boundary discipline.
- `lib/email.ts` — keep Resend; move the template out of a string literal and the
  send behind the job runner.
- **The idempotency pattern in `POST /api/feedback`** (client-generated UUID +
  unique constraint + "replay returns 200 with the original row") is exactly what
  every attendance provider needs. The single most directly transferable piece of
  logic in the codebase.
- Auth *primitives* (bcrypt cost, timing-safe compare, `jose` signing, the
  proxy-optimistic/DAL-authoritative split) — the pattern survives, the model
  does not.

**Cannot be reused:**

- `AdminUser` — replaced by `User` + scoped `RoleAssignment`.
- `requireAdmin()` as the only authz check.
- `lib/rate-limit.ts` implementation (interface is fine).
- Server Actions as the mutation mechanism for anything a mobile app or device
  must call.
- Stateless-only sessions.

**Reuse estimate:** ~35–40% of existing code carries forward; close to 100% of
infrastructure and conventions. The gap is that identity, RBAC, API surface,
jobs, storage, audit, device integration and sync don't exist in any form.

---

# 4. What Needs to Change

| # | Change | Why it's mandatory | Phase |
|---|---|---|---|
| 1 | `AdminUser` → `User` + `Employee` + scoped `RoleAssignment` | Nothing can be built on a single flat admin table. | 0 |
| 2 | Stateful sessions + refresh tokens for non-browser clients | Termination must revoke access immediately. | 0 |
| 3 | Versioned API (`/api/v1`, `/api/device/v1`) with token auth | Mobile and hardware clients cannot use Server Actions. | 0 |
| 4 | Domain/service layer (`lib/modules/<domain>/`) | Otherwise the same logic exists once per client. | 0 |
| 5 | Durable job runner + outbox (**Postgres-backed**) | Auto-close, projections, notifications, Odoo sync. | 0 |
| 6 | Append-only audit log, DB-enforced | Attendance feeds payroll. | 0 |
| 7 | Branch geo fields + timezone | `location: String` cannot support geofencing. | 0/1 |
| 8 | Provider abstraction + assurance model | The core of the new architecture. | 1 |
| 9 | Device gateway (shape TBD — see §7.2) | Fingerprint terminals may not be internet-reachable. | 2 |
| 10 | Shared-store rate limiting | Already broken; load-bearing for clock endpoints. | 0 |
| 11 | Branch-scoping enforced at the data layer | A branch manager must not see other branches. | 0 |
| 12 | Object storage + KMS | Profile photos, capture evidence, templates. | 5/6 |
| 13 | ~~Redis~~ | **Removed from the architecture entirely** — Postgres serves every proposed use. See [ADR 0002](./decisions/0002-no-redis.md). | never |
| 14 | Observability (structured logs, error tracking, sync dashboards) | `console.error` is insufficient once payroll depends on this. | 0 |

**Deliberately deferred:** object storage (nothing to store until mobile/face,
and S3-compatible when it arrives — never Vercel Blob), PostGIS (circles are
enough), facial recognition infrastructure (Phase 6), push notifications
(Phase 5).

**Removed, not deferred:** Redis. See [ADR 0002](./decisions/0002-no-redis.md).

**Portability constraint** ([ADR 0001](./decisions/0001-runtime-topology.md)):
Vercel and Neon are the current deployment, not an architectural dependency. No
Vercel-specific API or `@vercel/*` package in domain logic; no Neon-specific
driver or adapter; Postgres reached only through Prisma and a plain
`DATABASE_URL`; the container build stays working and CI-verified.

---

# 5. Recommended Target Architecture

**Modular monolith + worker + device gateway.** No microservices.

```
CAPTURE SURFACES  (each optional; engine runs with any subset)
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌───────────────┐
│ Fingerprint      │ │ Employee mobile  │ │ Manager web      │ │ Customer      │
│ terminal(s)      │ │ (React Native)   │ │ (Next.js RSC)    │ │ browser       │
│ at branch        │ │ GPS · face ·     │ │ manual entry ·   │ │ /feedback     │
│ device secret    │ │ attestation      │ │ corrections ·    │ │ no auth       │
│                  │ │ bearer token     │ │ approvals        │ │               │
└────────┬─────────┘ └────────┬─────────┘ └────────┬─────────┘ └───────┬───────┘
         │                    │                    │                   │
   ┌─────▼──────────┐         │                    │                   │
   │ DEVICE GATEWAY │         │                    │                   │
   │ shape TBD:     │         │                    │                   │
   │ A cloud endpt  │         │                    │                   │
   │ B on-prem      │         │                    │                   │
   │   branch agent │         │                    │                   │
   │ C batch import │         │                    │                   │
   │ buffers·retries│         │                    │                   │
   └─────┬──────────┘         │                    │                   │
         │ /api/device/v1     │ /api/v1            │ RSC + Actions     │
         └────────────────────┴──────────┬─────────┴───────────────────┘
                                         ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  BASILISSA OPERATIONS PLATFORM  (Next.js — web + API)                      │
│                                                                            │
│  EDGE     proxy.ts (optimistic routing) · rate limiting                    │
│                                                                            │
│  API      /api/v1/*        employee + manager (bearer)                     │
│           /api/device/v1/* device ingest (per-device credential)           │
│           /api/admin/*     web admin                                       │
│                                                                            │
│  AUTHZ    can(actor, action, resource) · GLOBAL|REGION|BRANCH scope        │
│           every query branch-scoped AT THE DATA LAYER                      │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  ATTENDANCE ENGINE          (provider-agnostic — §6)                 │  │
│  │                                                                      │  │
│  │   ProviderAdapter interface                                          │  │
│  │     ├─ MobileProvider      GPS + face + attestation                  │  │
│  │     ├─ FingerprintProvider device ingest, drift-aware                │  │
│  │     ├─ ManualProvider      manager entry, approval-gated             │  │
│  │     ├─ SystemProvider      auto-close, corrections replay            │  │
│  │     └─ (future) RFID / NFC / kiosk                                   │  │
│  │            ↓ normalised IngestCommand                                │  │
│  │   identify → dedup → assurance → policy → direction → PERSIST        │  │
│  │            ↓                                                         │  │
│  │   AttendanceEvent (immutable)  →  projection  →  AttendanceDay       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  DOMAIN   identity · employees · branches · devices · scheduling           │
│           attendance · overtime · approvals · corrections · feedback       │
│           notifications · audit · odoo-sync                                │
│                                                                            │
│  SERVICES geofence · biometric-verify (adapter) · storage (adapter)        │
│           email/push (adapter) · clock · audit-writer · outbox-writer      │
└──────┬─────────────────────────────────────────────┬───────────────────────┘
       │                                             │
       ▼                                             ▼
┌──────────────────┐   ┌──────────────────┐   ┌───────────────┐
│ PostgreSQL       │   │ Object store     │   │ Face engine   │
│ events · days    │   │ (Phase 5/6)      │   │ (Phase 6)     │
│ outbox · jobs    │   │ S3-COMPATIBLE:   │   │ self-hosted   │
│ sessions · nonces│   │ R2 / S3 / MinIO  │   │ or managed    │
│ rate limits      │   │ never Vercel Blob│   │               │
│ audit (append)   │   └──────────────────┘   └───────────────┘
└────────▲─────────┘
         │            NO REDIS — ADR 0002. Postgres serves queues, locks,
         │            sessions, rate limits and nonces. Nonces in particular
         │            MUST be Postgres: they are consumed in the same
         │            transaction as the attendance event.
         │  outbox / jobs tables (FOR UPDATE SKIP LOCKED)
┌────────┴───────────────────────────────────────────────────────────────────┐
│  WORKER PROCESS   (same repo, same modules, different entrypoint)          │
│   • day projection / settlement          • auto-close missing clock-outs   │
│   • device drift probes + health         • notification fan-out            │
│   • outbox drain → Odoo push             • Odoo pull → employee adoption   │
│   • nightly reconciliation → drift report                                  │
└──────────────────────────────┬─────────────────────────────────────────────┘
                               │ HTTPS · API key · Idempotency-Key
                               ▼   (absent / down / not-yet-built = fine)
                    ┌─────────────────────────┐
                    │  ODOO ERP (external)    │
                    │  hr.employee · payroll  │
                    │  hr.attendance          │
                    └─────────────────────────┘
```

**Runtime consequence:** pure serverless is now disqualified, not merely awkward.
The worker must run continuously, and — if the device investigation lands on
Scenario B (§7.2) — something must hold long-lived connections to branch LANs.
The Docker/Compose path already in the repo is the right target. Vercel remains
viable only as *web + API* alongside a separately hosted worker.

---

# 6. The Attendance Engine

The engine is the stable core. Everything else plugs into it.

## 6.1 Ingest pipeline

```
ProviderAdapter.normalise(rawInput) → IngestCommand {
    providerType, providerRef, externalEventId,
    employeeRef        (provider-scoped: userId | deviceUserId | employeeId)
    branchRef, deviceRef?
    sourceReportedAt, directionHint?, evidence{...}, idempotencyKey
}
        ↓
 1  AUTHENTICATE SOURCE   bearer / device credential / manager session
 2  IDENTIFY EMPLOYEE     provider-scoped ref → canonical employeeId
                          unmapped → QUARANTINE (never guess)
 3  IDEMPOTENCY           (providerType, externalEventId|idempotencyKey) UNIQUE
                          replay → return original event, 200
 4  RESOLVE TIME          per-provider authority (§6.3); compute skew
 5  DEDUP                 cross-provider window check (§6.5)
 6  ASSURANCE             compute identity/location/time profile (§6.2)
 7  POLICY                per-provider rules: geofence, active employee,
                          branch assignment, device enabled, schedule window
 8  DIRECTION             server-side state machine (§6.4)
 9  PERSIST (one tx)      AttendanceEvent + EventEvidence + AuditLog
                          + enqueue projection job
10  PROJECT (async)       rebuild AttendanceDay; enqueue outbox row if settled
11  RESPOND               where the transport permits it (§7.2)
```

Steps 1–3 and 9 are non-negotiable for every provider. Steps 4–8 are
provider-parameterised.

## 6.2 Assurance model

A single "trusted/untrusted" flag would collapse exactly the distinctions payroll
needs. Three independent axes:

```
identityAssurance   NONE               no verification (manual entry)
                    ASSERTED           claimed, unverified
                    DEVICE_BOUND       bound to a registered device
                    BIOMETRIC          fingerprint or face matched

locationAssurance   NONE               unknown
                    ASSERTED           client-claimed, unverified
                    GPS_VERIFIED       server-evaluated coordinates
                    PHYSICALLY_PRESENT  fixed device at a known branch

timeAssurance       SERVER             server clock
                    DEVICE_SYNCED      device clock, drift within threshold
                    DEVICE_UNVERIFIED  device clock, drift unknown/exceeded
                    HUMAN_ASSERTED     entered by a person
```

Profiles per provider:

| Provider | Identity | Location | Time |
|---|---|---|---|
| Fingerprint terminal | `BIOMETRIC` | `PHYSICALLY_PRESENT` | `DEVICE_SYNCED` / `DEVICE_UNVERIFIED` |
| Mobile + GPS + face | `BIOMETRIC` | `GPS_VERIFIED` | `SERVER` |
| Mobile + GPS only | `DEVICE_BOUND` | `GPS_VERIFIED` | `SERVER` |
| Manager manual | `NONE` | `NONE` | `HUMAN_ASSERTED` |
| System auto-close | `NONE` | `NONE` | `SERVER` |

**Business rules reference assurance, never provider names.** "Payroll-eligible
without review requires `identityAssurance >= DEVICE_BOUND`" survives the
addition of RFID; "provider != MANUAL" does not.

Note what this makes visible: the fingerprint terminal scores *higher* on
identity and location than the mobile app, and lower only on time. That is the
correct reading of reality and it should inform investment (§21, D3).

## 6.3 Time authority

Revision 1 stated that client timestamps must never be used. That rule holds for
mobile and breaks for hardware terminals, which supply their own timestamps from
a locally settable clock. Revised:

| Provider | `occurredAt` source | Risk | Control |
|---|---|---|---|
| `MOBILE_APP` | Server receipt | — | Client time stored as advisory only |
| `FINGERPRINT` | Device event time | **Drift / tampering** | NTP if supported; scheduled drift probe; store skew; flag beyond threshold; quarantine beyond hard limit |
| `MANAGER_MANUAL` | Manager-entered | Fabrication | Bounded to a plausible window; reason + approval + employee notification |
| `SYSTEM_AUTO_CLOSE` | Scheduled end | — | Zero overtime; always flagged |

Every event stores four time fields: `occurredAt` (authoritative, used for all
calculation), `sourceReportedAt` (raw, as given), `recordedAt` (server insert),
`clockSkewMs` (measured where possible). Device clock drift is a common and
entirely preventable cause of payroll disputes — treat it as a monitored SLO,
not a one-time provisioning step.

## 6.4 Direction (clock-in vs clock-out)

Derived server-side by a state machine over the employee's ordered events within
the resolved `workDate` window. Any provider-supplied `directionHint` is stored
and compared but **never obeyed** — terminal punch-state buttons are routinely
ignored by staff in practice, and a wrong state that silently becomes an
authoritative clock-out is a payroll defect.

Disagreement between hint and derivation is recorded as a flag, not an error, and
surfaces as a data-quality metric per device.

## 6.5 Cross-provider deduplication

Three capture paths means the same real-world action can arrive twice — an
employee punches the terminal and also opens the app. This is legitimate
behaviour, not abuse, and the brief has no policy for it.

```
Window: same employeeId, same derived direction, within DEDUP_WINDOW (default 5 min)
  → the HIGHEST-ASSURANCE event becomes CANONICAL
  → the other is retained with status SUPERSEDED and supersededByEventId set
  → both remain fully visible in the event log and the audit trail
  → never silently dropped
Ties broken by: earlier occurredAt, then richer evidence, then provider priority.
```

Retention of both events matters: an employee disputing a time needs to see every
signal the system received, not the one it chose.

## 6.6 Projection

`AttendanceDay` is a **pure function** of `(events, corrections, resolved
schedule, policy snapshot)`. Never hand-edited. Rebuildable at any time from the
event log — which is what makes retroactive correction and bug remediation
tractable, and what lets an auditor re-derive any figure independently.

---

# 7. Attendance Providers

## 7.1 Mobile provider (GPS + face)

Full flow, server-authoritative throughout:

```
1  Auth (access token; refresh if needed)
2  POST /api/v1/attendance/challenge
     → { nonce, serverTime, expiresAt (60s), assignedBranches[...] }
       nonce single-use, bound to userId + deviceId
3  Location permission → GPS acquire (accuracy floor + timeout)
4  Client shows ADVISORY distance preview — never a decision
5  Face capture + liveness (Phase 6; omitted earlier → lower assurance)
6  POST /api/v1/attendance/clock
     { nonce, idempotencyKey, branchId, lat, lng, accuracy,
       isMockLocation, faceCapture?, attestationToken, deviceId }
── server ──
7  consume nonce · idempotency check · verify attestation
8  employee active? assigned to branch? device registered?
9  geofence decide → INSIDE | OUTSIDE | AMBIGUOUS (§10)
10 face verify (if enabled) → score vs threshold + liveness
11 plausibility (teleport / velocity vs previous event)
12 persist per §6.1 step 9
```

Direction is derived, not sent. Client-reported time is advisory. Offline capture
queues locally with the issued nonce and submits on reconnect, flagged
`DEFERRED_OFFLINE`.

## 7.2 Fingerprint / device provider

**Nothing below assumes a specific device model, SDK or protocol.** The exact
terminal model, firmware, protocol, network posture and capability set must be
established by physical inspection before any implementation (§22, U1). What
follows is the design shape and the decision fork it must resolve.

### Deployment fork — the single largest cost variable in the programme

```
SCENARIO A — device pushes outbound to a server over HTTP(S)
  → cloud ingest endpoint /api/device/v1/events; no on-prem component
  → cheapest. Verify: can it target an arbitrary host/path? TLS support?
    modern cipher suites? any authentication beyond a serial number?

SCENARIO B — device only reachable on the branch LAN (server must poll/connect)
  → small on-prem BRANCH AGENT per branch (mini-PC / RPi / existing back-office
    machine): polls the terminal locally, buffers, forwards over HTTPS
  → adds hardware, provisioning, monitoring, field support at every branch
  → ALSO the correct choice under Scenario A if the terminal's TLS is weak or
    absent — the agent becomes the TLS uplink and credential holder

SCENARIO C — no usable network at the branch
  → scheduled file export/import; batch only, materially degraded
  → same-day exception handling becomes impossible; treat as a last resort
```

The answer determines hardware budget, deployment topology, ops burden and
timeline far more than any code decision. Establish it before committing dates.

### Design constraints regardless of scenario

- **Treat all device input as untrusted.** Terminals are typically weakly
  authenticated, often identified only by serial number, frequently unable to
  present a client certificate. Dedicated ingest endpoint, per-device credential,
  IP allowlist where the topology permits, strict schema validation, aggressive
  rate limiting, and quarantine-on-anomaly.
- **Identity mapping is explicit and manual.** Terminal user IDs are typically
  short integers assigned at enrolment on the device, with no relationship to
  anything in our database. `EmployeeDeviceIdentity(employeeId, deviceId,
  deviceUserId)` is required, plus an import/reconciliation tool for the
  enrolments already on the installed machines. **Unmapped IDs quarantine — they
  never guess.** A mis-mapped terminal ID silently pays the wrong person.
- **Fingerprint templates stay on the device.** We do not extract, store or
  centralise them. The terminals remain the biometric authority for this
  provider. This materially reduces our biometric compliance surface (§11, §18)
  and should be an explicit, documented decision.
- **Clock drift is monitored, not assumed.** Scheduled probe comparing device
  time to server time; record skew on every event; alert past threshold;
  quarantine past a hard limit. Sync via NTP if the firmware supports it.
- **Direction is derived, never taken from the punch-state button** (§6.4).
- **Response feedback is best-effort.** Many terminals cannot render a
  server-supplied message. Design the happy path to require no feedback; where
  the protocol allows a response, use it. Do not build rules that depend on the
  employee having seen a server message.
- **Offline behaviour must be characterised, not assumed.** Establish buffer
  capacity, overflow behaviour (FIFO drop? refuse punches?), and whether buffered
  events replay with original timestamps. Buffer overflow that silently discards
  punches is a payroll incident.
- **Backfill is normal.** Events arriving hours or days late must project
  correctly into already-settled days and trigger re-settlement plus, if already
  synced, an Odoo amendment (§14.5).

## 7.3 Manual provider (manager entry)

Available from Phase 1 — which means **the platform's least-verified path exists
before any of its verified ones.** It carries `identityAssurance = NONE` and is
the highest-fraud-risk surface in the system. "Heavily audited" is not a
sufficient specification. Required controls:

- **Reason code from a controlled vocabulary** (`DEVICE_OFFLINE`,
  `PHONE_UNAVAILABLE`, `NEW_EMPLOYEE_NOT_ENROLLED`, `FORGOT_TO_PUNCH`,
  `SYSTEM_OUTAGE`, `OTHER`) **plus mandatory free text.** Free text alone is
  unanalysable; codes alone lose the detail.
- **Bounded time window** — cannot record more than N days retrospectively
  without HR authority; cannot record a future time.
- **Never self-entry.** A manager cannot manually record their own attendance;
  it escalates to the area manager.
- **Second-level approval** above a per-branch monthly threshold, or for any
  entry generating overtime.
- **Automatic employee notification** on every manual entry affecting them.
- **Manual-entry rate as a first-class HR metric**, per branch and per manager,
  with alerting on anomalies. A branch whose manual rate climbs is either
  suffering a device fault or manufacturing hours — both need intervention.
- **Deliberate friction.** Manual entry must never be the path of least
  resistance. If it is easier than reporting a broken terminal, it becomes the
  default and the verification architecture becomes decorative.

## 7.4 System provider

Auto-close of missing clock-outs, correction replays, migrations. Always
`SYSTEM_AUTO_CLOSE`, always zero overtime, always flagged for review.

## 7.5 Future providers

`RFID`, `NFC`, `branch kiosk/tablet`, `web self-service`. Each is a new adapter
implementing the same interface plus an assurance profile. **No engine change.**
That is the test of whether the abstraction is correct.

---

# 8. Attendance Source & Method Tracking

Fully agreed and reinforced — with one correction to the proposed table shape.

Every event records:

```
providerType        MOBILE_APP | FINGERPRINT | MANAGER_MANUAL |
                    SYSTEM_AUTO_CLOSE | (future)
methodDetail        e.g. "GPS + Face", "Fingerprint", "Manual entry"
deviceId?           → Device { label "ZKTeco-01", branch, model, serial }
branchId
actorUserId?        who created it, for manual/correction paths
identity/location/time assurance   (§6.2)
verificationOutcome VERIFIED | PARTIAL | UNVERIFIED | FAILED_FALLBACK
status              CANONICAL | SUPERSEDED | QUARANTINED | VOIDED
flags[]
```

### Correction to the proposed table

The example table's single `Status` column mixes two orthogonal concepts: the
**verification outcome of an event** and the **lifecycle state of the day
record**. Rendering them in one column will mislead managers — "Corrected" is not
an alternative to "Valid"; a corrected event was also either valid or not when
captured.

Recommended presentation:

| Time | Event | Method | Source | Assurance | Verification | Note |
|---|---|---|---|---|---|---|
| 08:02 | Clock in | Mobile + Face | App (device A4F1) | High | Verified | — |
| 17:31 | Clock out | Fingerprint | ZKTeco-01 · Accra Mall | High | Verified | — |
| 08:00 | Clock in | Manual | Branch Manager | **None** | N/A | Reason: device offline |
| 17:45 | Clock out | Mobile + Face | App (device A4F1) | High | Verified | **Corrected** ← badge, not status |

Day-level lifecycle (`PENDING` / `SETTLED` / `NEEDS_REVIEW` / `DISPUTED`) belongs
on the day row above the event list, not in the event table.

Manual entries should be **visually distinct at a glance** — assurance `None` is
the single most important fact on that screen.

---

# 9. Immutable Events, Corrections & Audit

The Revision 1 recommendation stands and is reinforced by the multi-provider
model: with three capture paths of differing reliability, immutability is what
makes the record defensible.

```
AttendanceEvent        append-only, immutable, never updated, NEVER DELETED
        ↓
AttendanceCorrection   append-only typed operations
        ↓
AttendanceDay          pure projection — recomputable from the two above
        ↓
AuditLog               append-only, DB-enforced (no UPDATE/DELETE grant)
```

### Corrections are typed operations, not field edits

The worked example (fingerprint recorded 08:47, true time 08:02) is one of four
kinds:

```
ADJUST_TIME     change occurredAt of an existing event
INSERT_EVENT    add a missing punch (device outage, employee forgot)
VOID_EVENT      exclude an erroneous event (double punch, wrong person)
                ── excluded from projection; the row itself never disappears
REASSIGN_BRANCH corrected branch attribution (relief/cover work)
```

Each carries `reason`, `reasonCode`, `correctedBy`, `approvedBy?`, `createdAt`,
and before/after snapshots. Second-level approval is required when the correction
crosses a materiality threshold (default: alters payable minutes by more than 15,
creates overtime, or is older than 7 days) — matching the worked example, where a
regional manager approves a branch manager's correction.

The original event remains canonical in the log with the correction linked to it.
Both the original 08:47 fingerprint reading and the 08:02 corrected value are
permanently visible, with attribution and reason.

### Audit

Every state-changing action across the platform — not merely attendance — writes
`AuditLog { actor, actorRole, action, entityType, entityId, before, after, ip,
userAgent, createdAt }`. `UPDATE` and `DELETE` are revoked from the application
role at the database level on `audit_logs` and `attendance_events`. Application
discipline is not an audit control.

---

# 10. Geofencing

Geofencing is now **one provider's policy**, not a platform-wide rule. This is a
change from Revision 1.

| Provider | Geofence policy |
|---|---|
| `FINGERPRINT` | **Not applicable** — physical presence is implicit and stronger than any GPS assertion |
| `MOBILE_APP` | Evaluated server-side; three-state decision below |
| `MANAGER_MANUAL` | Not applicable — controlled by approval instead |
| `SYSTEM_AUTO_CLOSE` | Not applicable |

Model (unchanged): `Branch { latitude, longitude, geofenceRadiusMeters,
maxAcceptableAccuracyMeters, geofenceEnabled }`. Haversine in application code is
sufficient for tens of branches; PostGIS only if polygon fences become necessary.
**Snapshot the geofence onto the event** — a later radius change must not rewrite
historical decisions.

### Three-state decision (mobile only)

```
distance + accuracy <= radius     → INSIDE     confident, accept
distance - accuracy >  radius     → OUTSIDE    confident, reject clock-IN
otherwise                         → AMBIGUOUS  accept, flag, manager reviews
accuracy > maxAcceptableAccuracy  → retry ("waiting for better signal");
                                    after N retries → AMBIGUOUS
Clock-OUT outside the fence       → ALWAYS accept + flag.
                                    Blocking clock-out manufactures missing punches.
```

### GPS spoofing — the honest position

Mock-location apps are free and require no root on Android. Treat GPS as an
**audit signal and deterrent, not an access control.** Layered mitigations, by
value: device attestation (Play Integrity / App Attest — native app only) >
branch-side presence factor > mock-provider flag > plausibility/teleport analysis
> behavioural analytics.

**The fingerprint terminal is itself the strongest available presence factor**,
and it already exists in the branches. That materially reduces the pressure to
solve GPS spoofing perfectly — for an employee who punches the terminal, location
is proven physically. GPS matters only for the mobile path.

### Continuous tracking

**No.** Location is collected only at clock-in and clock-out. Continuous tracking
is a serious privacy intrusion, drains battery, costs the employee data, expands
liability under Ghana's Data Protection Act, and adds nothing — you already know
they are at work between the two events.

---

# 11. Facial Verification

Now explicitly **Phase 6 and optional**. The engine, the fingerprint provider,
manual entry, corrections, scheduling, overtime and Odoo sync all ship and
operate without it. Removing face verification lowers `identityAssurance` on the
mobile path from `BIOMETRIC` to `DEVICE_BOUND`; nothing else changes.

**Architecture:** hybrid, with the decision on the server. On-device face
detection, quality gating and liveness capture; server-side embedding, matching
and accept/reject. Client-side matching is disqualified — the client would decide
whether it passed, which a modified app always answers "yes."

**Storage:** biometric template (embedding) in a dedicated table, encrypted with
a dedicated KMS key, never logged, never returned by any API, never sent to Odoo.
A separate HR-facing reference photo in private object storage behind short-lived
signed URLs, with access itself audited. Model name and version stored alongside
every template — a model upgrade invalidates all embeddings and requires
re-enrolment.

**Technology:** self-hosted (InsightFace/ArcFace via ONNX) keeps biometric data
in-infrastructure and possibly in-region; managed (AWS Rekognition, Azure Face —
the latter requires Limited Access approval) is faster to build but exports
Ghanaian employees' biometric data to a foreign region, with latency and Data
Protection Act implications requiring legal sign-off. **Liveness** is where
homegrown implementations fail — prefer a commercial passive-liveness SDK;
server-issued active challenge–response is the acceptable floor.

**Thresholds:** tune for low false-accept; route false-rejects to the manager
fallback. Log the similarity score on every attempt so the threshold can be tuned
against real data rather than guessed.

> **Stated plainly:** face-recognition error rates are not uniform across
> demographics. NIST FRVT evaluations have repeatedly found elevated false-match
> rates for some demographic groups, including darker-skinned faces, and worse
> performance on women in several algorithms. For a Ghanaian workforce this is
> the deployment population, not an edge case. Make demographic accuracy an
> explicit vendor-selection criterion and pilot on a real cross-section of
> Basilissa staff before rollout. Capture quality — front-camera hardware and
> lighting at a 5am shift start — will affect accuracy more than model choice.

**Compliance.** Ghana's Data Protection Act, 2012 (Act 843) applies; controllers
register with the Data Protection Commission and processing requires a lawful
basis. Obtain Ghanaian legal review before enrolling anyone — this document flags
the obligation and is not legal advice. Consent taken as a condition of
employment is legally fragile, so a **non-biometric alternative must remain
available** — which the fingerprint terminal and manual entry already provide,
making this constraint cheap to satisfy in this architecture. Also required:
documented retention with a tested purge path, enforced purpose limitation
(clock-in/out only), and in-person, dual-signed, audited, alertable enrolment.
**Enrolment is the weakest link** — whoever enrols a face controls that identity,
and silent re-enrolment defeats every other control in this document.

---

# 12. Working Hours Model

## Where schedules belong

A combination — **explicitly not Role.** Roles are a permissions construct;
overloading them with scheduling produces "Cashier-Weekend role" within six
months. Resolution, most specific wins:

```
1. Per-day override        ScheduleException (swap, cover, approved variation)
2. Employee assignment     EmployeeShiftAssignment (recurring pattern)
3. Branch default          Branch.defaultShiftPatternId
4. No schedule             attendance still recorded; no lateness/OT computed;
                           flagged UNSCHEDULED
```

`Shift` is a reusable template (start, end, `crossesMidnight`, break minutes,
grace windows, OT threshold). `ShiftPattern` composes shifts into a rota.
Assignments are **effective-dated and never mutated** — close-date and create a
new one, or historical calculations silently change.

**Minimum viable scheduling ships in Phase 1**, not Phase 7 — see §21, D6. Late
arrival, missing clock-outs and overtime are all undefined without a scheduled
start and end, and the manager operations phase depends on all three.

## Computed fields — integer minutes, never floats

```
workDate               anchored to the SHIFT'S scheduled start, not the clock
                       timestamp. This is what makes overnight shifts work.
scheduledStart/End     snapshotted from the resolved schedule at settle time
actualIn/Out           from canonical events
lateMinutes            max(0, actualIn - scheduledStart - graceIn)
earlyDepartureMinutes  max(0, scheduledEnd - actualOut - graceOut)
breakMinutes           paired BREAK events, or auto-deduction per branch policy
grossMinutes           actualOut - actualIn
netWorkedMinutes       grossMinutes - unpaidBreakMinutes
regularMinutes         min(netWorked, scheduledMinutes)
overtimeMinutes        beyond = netWorked - scheduledMinutes
                       beyond > otThreshold ? beyond : 0
                       ── the threshold GATES overtime, it is not deducted
                          from it. Work under it past your shift and none
                          counts; work over it and all of it does.
                          Deducting instead would shave the threshold off
                          every claim forever, which is the rounding-down
                          problem wearing a different hat.
status                 PENDING | SETTLED | NEEDS_REVIEW | CORRECTED | DISPUTED
flags[]                MISSING_CLOCK_OUT · GEOFENCE_AMBIGUOUS · FACE_FALLBACK
                       DEFERRED_OFFLINE · UNSCHEDULED · TELEPORT_SUSPECTED
                       CROSS_BRANCH · MANUAL_ENTRY · DEVICE_CLOCK_DRIFT
                       DUPLICATE_SUPERSEDED · LATE_ARRIVING_EVENT
```

**Breaks:** model the events from Phase 1 even if the UI comes later —
retrofitting break handling into settled historical data is genuinely painful.

**Overnight:** `workDate` derives from the scheduled shift start, plus
`Shift.crossesMidnight`, plus a bounded matching window (clock-out matches the
most recent unclosed clock-in within ~18 hours). A 22:00 Tuesday → 06:00
Wednesday shift is one `AttendanceDay` with `workDate = Tuesday`.

---

# 13. Overtime & Approval Workflow

Manager approval is correct, with two refinements that keep the control real:

1. **A threshold.** Overtime below a configured grace (default 10 minutes) is not
   overtime. Restaurant closes are never punctual.
2. **Pre-authorised vs unplanned.** Manager-scheduled extra hours create a
   `PreAuthorizedOvertime` window; overtime inside it auto-approves on completion
   with an audit entry. Only unplanned overtime enters the review queue. Without
   this, managers face dozens of daily items and will rubber-stamp them — which
   destroys the control entirely.

```
Day settles (worker, after shift end + buffer)
  ↓ overtimeMinutes > threshold?
  ├─ no  → SETTLED → outbox (regular hours)
  └─ yes → inside a pre-authorised window?
             ├─ yes → AUTO_APPROVED (audited, manager notified, not queued)
             └─ no  → OvertimeRequest PENDING_APPROVAL
                        ↓ manager reviews: schedule, events, SOURCE + ASSURANCE
                          of each event, flags, employee note
                        ↓ APPROVE_FULL | APPROVE_PARTIAL(minutes, reason)
                          | REJECT(reason)        ← reason mandatory
                        ↓ APPROVED → payableOvertimeMinutes set
                        ↓ SyncOutbox row written IN THE SAME TRANSACTION
                        ↓ worker → Odoo → CONFIRMED (externalRef stored)

Escalation: PENDING > 72h → area manager. > 7 days → HR, plus a written
            auto-approve or auto-lapse policy. Silent indefinite pending is
            how payroll disputes start.
```

**Nobody approves their own overtime** — a branch manager's own escalates to the
area manager. Enforced in the domain layer, not the UI.

**Overtime awareness in Phase 1, workflow in Phase 7.** The projection computes
`overtimeMinutes` from the start (informational, visible); the approval workflow,
partial approval, pre-authorisation and disputes come later.

## Edge cases

| Case | Resolution |
|---|---|
| **Forgot to clock out** | Nightly auto-close at `scheduledEnd`, flag `MISSING_CLOCK_OUT`, **overtime zero**, status `NEEDS_REVIEW`. Never auto-award OT for a missing punch — the primary fraud vector. |
| **Terminal offline all day** | Manual provider with reason code `DEVICE_OFFLINE`; device health alert should have fired first. |
| **Punched terminal AND app** | Dedup (§6.5): highest assurance canonical, other superseded, both visible. |
| **Device clock drifted 20 min** | Event flagged `DEVICE_CLOCK_DRIFT`; day → `NEEDS_REVIEW`; recorded skew lets the manager correct with evidence. Matches the worked example in §9. |
| **Stayed late, unauthorised** | Recorded — the hours happened. `PENDING_APPROVAL`; may be rejected as payable while the record stands. Rejected-but-worked ≠ didn't-work. |
| **Partial approval** | `calculatedMinutes` vs `approvedMinutes` as separate columns + mandatory reason + employee notified of the delta. |
| **Clock-out outside geofence** | Accept, flag. Blocking creates worse data. |
| **Overnight / crosses midnight** | `workDate` from scheduled start; 18h matching window. |
| **Manager edits attendance** | Typed correction, never mutation (§9); audited; employee notified; second-level approval above threshold. |
| **Employee disputes** | First-class `AttendanceDispute`. Employee sees their own evidence — times, source, assurance, map pin — but **not** face images. HR escalation; all transitions audited. |
| **Cross-branch / relief** | `EmployeeBranchAssignment` many-to-many; flagged `CROSS_BRANCH`; visible to both managers. |
| **Verification failed but worked** | `PENDING_VERIFICATION`, manager confirms. Tracked as a metric — a rising rate means threshold or capture quality needs attention. |
| **Event arrives after settlement** | Re-settle; if already synced to Odoo, emit an amendment (§14.5), never an in-place edit. |

---

# 14. Odoo Integration

## 14.1 Odoo is not a runtime dependency — agreed, and this was already the design

The separation is correct and non-negotiable. Attendance is captured, projected,
corrected and approved entirely within the platform. Synchronisation is an
outbound, asynchronous, retried, reconciled concern. Odoo being unbuilt, offline
or rejecting requests has **zero** effect on an employee's ability to clock in.

## 14.2 The ownership split — right destination, wrong starting state

The proposed split is correct as a **steady state**:

| Domain | Owner | Direction |
|---|---|---|
| Employee master, employee ID, contract, department, job title | **Odoo** | Odoo → us |
| Payroll, compensation, tax | **Odoo** | never touched by us |
| Leave balances / entitlement | **Odoo** | Odoo → us (read-only) |
| Attendance capture, events, evidence | **us** | us → Odoo (approved only) |
| Geofence rules, devices, device identities | **us** | ours |
| Schedules, rosters, exceptions | **us** | ours |
| Overtime workflow, approvals, corrections | **us** | summary pushed; trail stays ours |
| Verification evidence (GPS, face, biometric) | **us only** | **never leaves our system** |
| Operational branch management, feedback, dashboards, audit | **us** | ours |

**But it cannot hold on day one, and the brief does not address this.** If Odoo
owns employee master data *and* Odoo may not exist yet, the first deployment has
no source of employees. This is the largest gap in the stated assumptions.

### Required: a designed ownership-transfer path

```
STAGE 1  PRE-ODOO — platform is temporarily the employee master
         Employee records created in-platform (HR UI or CSV import)
         odooEmployeeId NULL · masterSource = LOCAL
         Full attendance capability. No sync. Outbox accumulates or is disabled.

STAGE 2  ADOPTION — Odoo arrives
         Pull Odoo employees → match candidates (employeeCode, name+DOB, email)
         HR reviews an EXPLICIT match/link/create-new queue — never auto-match
         on name alone. Unmatched in either direction is surfaced, not silently
         resolved. On link: odooEmployeeId set, masterSource = ODOO.
         Field-level authority transfers per the table above; locally-owned
         fields (branch assignment, device identity, schedule) stay ours.
         Historical attendance is backfilled or explicitly declared
         out-of-scope — a business decision, made deliberately.

STAGE 3  STEADY STATE — Odoo authoritative for its domains
         Ongoing pull sync; conflicts on Odoo-owned fields resolve to Odoo;
         a per-field lastWriteSource guards against silent overwrite.
```

`masterSource` and a nullable `odooEmployeeId` must exist in the schema from
Phase 0, even though nothing uses them until Phase 4. Retrofitting identity
ownership after employees exist is materially harder than designing for it.

**Leave balances have the same problem.** Any attendance rule that consults "is
this employee on leave" must degrade gracefully to "unknown" pre-Odoo rather than
failing closed. Do not write rules that assume leave data exists.

## 14.3 Synchronisation architecture

```
APPROVAL / SETTLEMENT (web request or worker)
  └─ ONE TRANSACTION: update AttendanceDay
                      insert AuditLog
                      insert SyncOutbox { entityType, entityId, operation,
                                          payload, idempotencyKey,
                                          status PENDING, attempts 0,
                                          nextAttemptAt }
     ── the outbox row and the business change commit together or not at all.
        This is what makes "approved but never synced" structurally impossible.

WORKER (~every 30s)
  └─ SELECT ... WHERE status IN (PENDING, RETRYING) AND nextAttemptAt <= now
       FOR UPDATE SKIP LOCKED              ← safe with multiple workers
     → POST with Idempotency-Key
     → 2xx        SYNCED, store externalRef in OdooSyncRecord
     → 4xx perm   FAILED  → dead letter → alert
     → 4xx data   REQUIRES_REVIEW → human queue (business problem, not transport)
     → 5xx/timeout RETRYING, attempts++, exponential backoff + jitter,
                   circuit breaker after N consecutive failures
     → attempts > 10  FAILED → replay UI + alert

If Odoo is not yet implemented: the outbox is simply disabled or accumulates
under a feature flag. Nothing else in the platform is aware.
```

### Sync states

The proposed set is right, with one split:

```
PENDING          queued, not yet attempted
RETRYING         transient failure, backoff scheduled
SYNCED           confirmed by Odoo, externalRef stored
FAILED           permanent transport/protocol failure → dead letter, replayable
REQUIRES_REVIEW  Odoo rejected on business grounds (unmapped employee, closed
                 payroll period, invalid contract). A HUMAN queue, not a retry
                 queue — retrying will never fix it.
```

`REQUIRES_REVIEW` needs a named owner (HR for data problems, Admin for mapping
problems) and an SLA. Without both it silently accumulates, which is the failure
mode that turns a good sync design into a bad one.

## 14.4 "Odoo accepted it but we never got the response"

The most important question in the brief. This is the classic partial-failure
case, and it has three layered answers:

1. **Idempotency key — the primary answer.** Retrying with the same key returns
   the original result rather than creating a duplicate. **Make this the single
   non-negotiable item in the API contract.** Odoo's `hr.attendance` has no
   native idempotency concept, so require either a custom field holding our key
   with a unique constraint, or an endpoint that upserts on it.
2. **Query-before-retry.** If idempotency cannot be provided, the worker must
   search Odoo for our reference before re-posting. Slower, racier, strictly
   worse — treat as the fallback that justifies pushing hard for (1).
3. **Reconciliation as backstop.** The nightly diff catches anything the first
   two miss and is the reason a missed response degrades to a delay rather than a
   duplicate payment.

Duplicate prevention is therefore three-layered: unique idempotency key on the
outbox row, `OdooSyncRecord(localId ↔ odooId)` on our side, and a unique field on
the Odoo side. Never rely solely on the remote system's memory.

## 14.5 Amendments

Once a record is `SYNCED`, later corrections must not silently mutate it. Emit a
distinct amendment operation referencing the stored `externalRef`, with its own
idempotency key. Payroll periods close; the amendment path must handle rejection
for a closed period by routing to `REQUIRES_REVIEW` rather than retrying forever.

## 14.6 Reconciliation, auth, audit

- **Nightly reconciliation:** diff `SYNCED` records against Odoo for the window;
  report missing-in-Odoo, missing-here, value mismatches, orphans. Surfaces as an
  admin dashboard, not a log line. Alert on outbox depth and oldest-pending age.
- **Inbound:** prefer signed, replay-protected webhooks; **design for polling**
  and treat webhooks as an optimisation. Nightly full sync regardless — new
  hires, terminations, transfers. **Termination must revoke platform access
  same-day**, which makes the inbound path a security control, not just a data feed.
- **Auth:** API key or OAuth2 client-credentials in a secret manager, rotatable
  without redeploy, one credential per environment, least privilege.
- **Audit:** every attempt logged with request/response (secrets redacted),
  attempt number, outcome. The lifecycle captured → approved → synced → confirmed
  must be reconstructable for any record.
- **Never call Odoo from a client.** Every call originates from the worker.

---

# 15. Roles & Permissions

A permission is `(role, scope)`. "Branch Manager" is meaningless without "of
which branch."

```
RoleAssignment { userId, role, scopeType: GLOBAL|REGION|BRANCH, scopeId,
                 validFrom, validTo }
```

Users may hold several assignments. Authorisation is `can(actor, action,
resource)` where the resource carries its branch — **enforced in the
repository/data layer, not in page components.** UI-only enforcement is how a
branch manager reads another branch's data through a URL parameter.

| Role | Scope | Can do |
|---|---|---|
| **Employee** | self | Clock in/out; view own attendance, hours, OT status, and the **source and assurance** of their own events; raise disputes; view own schedule. Never sees others' data. |
| **Shift Supervisor** *(optional)* | branch | Employee + live branch attendance, flag issues, confirm verification-fallback clock-ins. **No** OT approval, **no** corrections, **no** manual entry. |
| **Branch Manager** | own branch(es) | Branch operations: view their employees, **manual attendance entry** (rate-limited, audited), corrections (audited, capped), approve OT, manage schedules/rota, view branch feedback + reports, view device health, propose geofence changes. **Cannot:** create/delete employees, change pay, approve own OT, enter own attendance, see other branches, alter audit logs. |
| **Area/Regional Manager** | region | All branch-manager powers across their branches; approve escalated OT and corrections; approve branch-manager OT and manual entries; approve geofence changes; reassign staff. |
| **HR** | global (people) | Employee lifecycle, **Odoo employee adoption/matching queue**, biometric enrolment, leave admin, dispute escalation, policy config (grace, OT thresholds, dedup window), org-wide reports, manual-entry-rate monitoring. Not IT/system config. |
| **Administrator** | global (system) | Branch CRUD, **device registration and health**, feedback questions, roles, Odoo sync monitoring and replay, notification config. Not employee PII beyond admin need; **not** biometric templates. |
| **Super Admin** | global | Everything including role grants and audit read. 1–2 people, MFA-mandatory, all actions logged and alerted. |

**Branch manager is the load-bearing role.** Their daily surface: who's in now,
who's late, exceptions, OT queue, device health, this week's rota, branch
feedback trend — one screen, phone-usable. Guardrails: no self-approval, no
self-entry, corrections audited and HR-visible, second-level sign-off above
thresholds, scope enforced at the data layer, and **anomaly alerting on manual
entry and correction rates.** Manager-driven manipulation is the most common
workforce-system fraud pattern and is an insider threat by definition — counter
it with visibility, not blocking.

**Migration:** existing `AdminUser` rows → `User` + `RoleAssignment{SUPER_ADMIN,
GLOBAL}`, preserving `passwordHash`. Nobody loses access.

---

# 16. Feedback in the Platform

Merge it as a module. `Branch` is the shared spine; duplicating it across two
systems means two sources of truth for the entity everything else references.

```
Basilissa Operations Platform
├── Dashboard        role-scoped
├── Branches         ← extends the existing entity
├── Employees        new
├── Attendance       new
├── Devices          new
├── Overtime         new
├── Schedules        new
├── Feedback         ← the existing system, largely untouched
├── Reports          extends existing analytics patterns
├── Notifications    extends existing email infrastructure
└── Odoo Integration new
```

**Two hard constraints:**

1. **The public feedback flow stays fully decoupled from employee auth.** It is
   anonymous and unauthenticated and must remain so. `/feedback` and
   `POST /api/feedback` keep their own route group with no shared middleware, no
   session dependency, no possibility of leaking employee data. The current code
   already has this separation cleanly — preserve it.
2. **The feedback system is live.** All changes additive. Printed QR codes in
   branches must keep working — `/feedback?branch={slug}` and every existing slug
   remain valid permanently.

**Scope note:** integrating feedback is smaller than it appears. Role-scoped
feedback access for branch managers falls out of Phase 0's RBAC work for free.
The genuinely new work is combined operational reporting — correlating staffing
levels against service ratings — which is the actual product value and belongs
late, once both datasets exist.

---

# 17. Conceptual Data Model

**Reuse untouched:** `Question`, `FeedbackSubmission`, `FeedbackAnswer`.
**Extend:** `Branch`. **Replace:** `AdminUser` → `User` + `RoleAssignment`.

```
IDENTITY & ACCESS
  User              email, passwordHash, phone, status, mfaSecret?,
                    lastLoginAt, passwordChangedAt, sessionVersion
  RoleAssignment    userId, role, scopeType, scopeId, validFrom, validTo
  Session           userId, deviceId, refreshTokenHash, expiresAt, revokedAt,
                    ip, userAgent                      ← enables revocation
  UserDevice        userId, platform, model, appVersion, pushToken,
                    attestationStatus, trustedAt, revokedAt

PEOPLE
  Employee          userId?, employeeCode (unique), odooEmployeeId? (unique),
                    masterSource: LOCAL|ODOO,          ← ownership transfer
                    firstName, lastName, jobTitle,
                    hireDate, terminationDate, status
                    ── no primaryBranchId: it would duplicate
                       EmployeeBranchAssignment.isPrimary, and two places to
                       record the same fact is two places to disagree.
  EmployeeBranchAssignment  employeeId, branchId, isPrimary, validFrom/To
                    ── the single source of truth for where someone works,
                       effective-dated so a transfer never rewrites the branch
                       that past attendance was recorded against.
  EmployeeDeviceIdentity    employeeId, deviceId, deviceUserId,
                            enrolledAt, enrolledBy, validFrom/To
                            UNIQUE(deviceId, deviceUserId)   ← terminal mapping
  EmployeeBiometricTemplate employeeId, vector(encrypted), modelName,
                            modelVersion, quality, enrolledBy, enrolledAt,
                            supersededAt     ← Phase 6; separate key + policy
  EmployeeProfilePhoto      employeeId, storageKey, uploadedBy, uploadedAt

BRANCH (extended)
  Branch  + latitude, longitude, geofenceRadiusMeters,
            maxAcceptableAccuracyMeters, geofenceEnabled,
            timezone (default Africa/Accra), odooBranchId?,
            defaultShiftPatternId?, address fields, openingHours

DEVICES
  Device            branchId, label ("ZKTeco-01"), kind: FINGERPRINT|KIOSK|...,
                    vendor, model, serialNumber (unique), firmwareVersion,
                    credentialHash, ingestMode: PUSH|POLL|BATCH,
                    isActive, lastSeenAt, lastClockSkewMs, healthStatus
  DeviceHealthCheck deviceId, checkedAt, reachable, clockSkewMs, bufferDepth?,
                    notes

SCHEDULING
  Shift                   name, branchId?, startTime, endTime, crossesMidnight,
                          breakMinutes, breakPaid, graceInMinutes,
                          graceOutMinutes, overtimeThresholdMinutes
  ShiftPattern            name, branchId?, cycleDays
  ShiftPatternDay         patternId, dayIndex, shiftId?   (null = rest day)
  EmployeeShiftAssignment employeeId, shiftPatternId, validFrom, validTo
                          ← effective-dated, NEVER mutated in place
  ScheduleException       employeeId, date, shiftId?, type, reason, createdBy

ATTENDANCE
  AttendanceEvent    employeeId, branchId, direction: IN|OUT|BREAK_START|BREAK_END,
                     providerType, providerRef, deviceId?, actorUserId?,
                     occurredAt, sourceReportedAt, recordedAt, clockSkewMs?,
                     directionHint?, hintMismatch,
                     identityAssurance, locationAssurance, timeAssurance,
                     verificationOutcome,
                     status: CANONICAL|SUPERSEDED|QUARANTINED|VOIDED,
                     supersededByEventId?, idempotencyKey, externalEventId?,
                     flags[]
                     UNIQUE(providerType, COALESCE(externalEventId,
                                                   idempotencyKey))
                     ── APPEND-ONLY. Never updated. Never deleted.
  EventEvidence      eventId, latitude?, longitude?, accuracyMeters?,
                     distanceMeters?, geofenceDecision?, geofenceSnapshot(json)?,
                     faceScore?, faceThreshold?, faceModelVersion?,
                     livenessResult?, attestationVerdict?, isMockLocation?,
                     capturedFrameKey?, deviceRawPayload(json)?,
                     retentionExpiresAt
                     ── separate table: sparse, provider-specific, retention-governed
  AttendanceDay      employeeId, branchId, workDate, shiftIdSnapshot,
                     scheduledStart/End, actualIn/Out, breakMinutes,
                     grossMinutes, netWorkedMinutes, regularMinutes,
                     lateMinutes, earlyDepartureMinutes,
                     overtimeMinutes, payableOvertimeMinutes,
                     lowestAssurance,                 ← drives review routing
                     status, flags[], settledAt, projectionVersion
                     UNIQUE(employeeId, workDate)
  AttendanceCorrection  attendanceDayId, eventId?, operation: ADJUST_TIME|
                        INSERT_EVENT|VOID_EVENT|REASSIGN_BRANCH,
                        before(json), after(json), reasonCode, reasonText,
                        correctedBy, approvedBy?, createdAt   APPEND-ONLY
  AttendanceDispute     attendanceDayId, raisedBy, reason, status, resolution,
                        resolvedBy, resolvedAt
  QuarantinedEvent      providerType, deviceId?, rawPayload, reason,
                        receivedAt, resolvedAt?, resolvedBy?, resolvedAs?
                        ── unmapped device users, impossible times, unknown
                           branches. Never guessed, never dropped.

APPROVALS
  OvertimeRequest    attendanceDayId, employeeId, branchId, calculatedMinutes,
                     requestedMinutes, approvedMinutes, status,
                     autoApprovedReason?, approverId, decisionReason, decidedAt,
                     escalatedTo?, escalatedAt?
  PreAuthorizedOvertime  branchId, employeeId?, from, to, maxMinutes,
                         authorizedBy, reason

PLATFORM
  AuditLog       actorUserId, actorRole, action, entityType, entityId,
                 before(json), after(json), ip, userAgent, createdAt
                 ── APPEND-ONLY. No UPDATE/DELETE grant for the app role.
  Job            type, payload, runAt, attempts, lockedAt, lockedBy, status
                 ── Postgres-backed. FOR UPDATE SKIP LOCKED. No Redis needed.
  SyncOutbox     entityType, entityId, operation, payload, idempotencyKey,
                 status, attempts, lastError, nextAttemptAt, externalRef
  OdooSyncRecord localType, localId, odooModel, odooId, lastSyncedAt, checksum
  Notification   userId, channel, type, payload, status, sentAt, readAt

LATER   LeaveType · LeaveRequest · LeaveBalance (mirrored from Odoo)
```

## Schema notes

- **`EventEvidence` is separate from `AttendanceEvent`** because evidence is
  sparse (a fingerprint event has no GPS), provider-specific, and subject to
  retention purging that must not touch the immutable event row.
- **Integer minutes everywhere.** `overallScore Float` is fine for a rating
  average; it would be a defect for payable hours.
- **Snapshot policy onto records** — schedule, geofence, thresholds — so a later
  configuration change cannot rewrite history.
- **`lowestAssurance` on the day** lets review queues be driven by a single
  indexed column rather than a join across every event.
- **DB-level append-only enforcement**: revoke UPDATE/DELETE from the application
  role on `audit_logs` and `attendance_events`.
- **`QuarantinedEvent` is mandatory, not optional.** With hardware providers,
  unmapped and malformed input is routine. Guessing is the one unacceptable
  response; dropping is the second.
- **Indexes:** `AttendanceEvent(employeeId, occurredAt)`,
  `AttendanceEvent(deviceId, occurredAt)`, `AttendanceDay(branchId, workDate)`,
  partial `AttendanceDay(status)` for review queues,
  `SyncOutbox(status, nextAttemptAt)`, `Job(status, runAt)`,
  `RoleAssignment(userId)` and `(scopeType, scopeId)`.
- **`Question.order` global uniqueness** should become `UNIQUE(branchId, order)`
  (nullable = global) if per-branch feedback questions are ever wanted. Cheap now,
  expensive later.
- **Partition** `attendance_events` and `audit_logs` by month when volume
  justifies it. At ~200 employees × 4 events/day ≈ 290k events/year — not urgent,
  but design the shape now.

---

# 18. Security Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Manual entry abuse** | **Critical** | The least-verified path, available first, used by the role with the most local authority. Controlled reason codes + free text; bounded retro window; no self-entry; second-level approval above threshold; employee notification; per-manager/per-branch rate metrics with HR alerting; deliberate friction (§7.3). |
| **Terminal identity mis-mapping** | **Critical** | `EmployeeDeviceIdentity` explicit and audited; unmapped IDs quarantine, never guess; periodic mapping reconciliation; alert on mapping changes. A mis-mapped terminal ID silently pays the wrong person. |
| **Face enrolment attack** | **Critical** | In-person, dual sign-off, audited and alerted enrolment/re-enrolment. Defeats every downstream control if left open. |
| **Biometric data breach** | **Critical** | Templates in a separate table with a separate KMS key; never logged, never in API responses, never sent to Odoo; frames purged within days; reference-photo access audited. **Fingerprint templates stay on the terminals — we never centralise them**, which materially shrinks this surface. |
| **Device clock tampering** | High | Per-event skew recording; scheduled drift probes; flag past threshold, quarantine past hard limit; physical/firmware access control on terminals. |
| **Device endpoint abuse** | High | Dedicated ingest endpoint; per-device credential; IP allowlist where topology permits; strict schema validation; rate limiting; quarantine on anomaly; **treat all device input as hostile**. On-prem agent as TLS uplink where firmware TLS is weak. |
| **GPS spoofing** | High | Server-side decision; attestation (native only); mock-provider flag; teleport/jitter analysis. **The fingerprint terminal is itself the strongest presence factor and already exists.** GPS is evidence, not a gate. |
| **Face spoofing** | High | Server-side matching; passive liveness; single-use nonce; attestation. |
| **Buddy punching** | High | Fingerprint biometric at supervised hardware; device binding on mobile; face verification; alert on device-change frequency. |
| **Duplicate/replayed events** | High | Provider-scoped uniqueness on `(providerType, externalEventId)`; idempotency keys; cross-provider dedup with both events retained. |
| **Replay attacks (mobile)** | High | Single-use, short-TTL, user+device-bound nonce; idempotency keys. |
| **Unauthorised approvals** | High | Scope-enforced authz at the data layer; no self-approval; second-level above thresholds; every decision audited and employee-notified. |
| **Manager attendance manipulation** | High | Immutable events + typed append-only corrections + employee notification + HR-visible correction-rate metrics + anomaly alerting. Insider threat — detect, don't just block. |
| **Odoo sync manipulation** | Medium | Server-only calls; idempotency; nightly reconciliation with drift alerting; full request/response audit; amendments never silent mutations. |
| **Privilege escalation** | High | Role changes require Super Admin, audited and alerted; `sessionVersion` bump invalidates tokens on privilege change; deny-by-default; scope at the repository layer. |
| **Stale access after termination** | High | Stateful sessions with server-side revocation; short access-token TTL; **Odoo termination sync triggers same-day revocation**; terminal enrolment removal must be part of the offboarding checklist. |
| **API abuse / brute force** | Medium | Shared-store rate limiting per user/device/IP/endpoint. Fix the currently-broken limiter first. |
| **Device compromise (mobile)** | Medium-High | Attestation gates clock-in; refuse or flag on failure; certificate pinning; no secrets in app storage; 15-min access tokens + rotating refresh. |
| **Insider DB access** | Medium | Least-privilege DB roles; no UPDATE/DELETE on append-only tables; encrypted backups; per-environment credentials. |

Missing today and blocking: **MFA for privileged roles** and **error tracking /
security alerting**. Neither is optional once payroll depends on the data.

---

# 19. Client Surfaces: Mobile, Web, Device

| Surface | Owns | Notes |
|---|---|---|
| **Fingerprint terminal** | Punch capture at the branch | Already installed. Highest identity + location assurance. No UI work — integration only. Likely the **fastest path to production value**. |
| **Employee mobile (React Native)** | Clock in/out, own history, own schedule, OT status, disputes, push | **Native, not PWA.** Attestation and mock-location detection are native-only, and they are the two strongest anti-spoofing controls. A web clock-in reduces GPS verification to a logging exercise. Phase 5. |
| **Manager / HR / Admin web** | Live attendance, exceptions, manual entry, corrections, approvals, device health, rota, reports, feedback | Responsive web extending the existing Next.js admin. **No second native app** — but approval and live-attendance screens must be genuinely phone-usable. A branch manager is standing on a restaurant floor. |
| **Employee web (read-only)** | View attendance/hours | Fallback for employees without a suitable phone. No clock actions. |
| **Customer web** | `/feedback` | Unchanged, public, anonymous. |

**Branch kiosk/tablet** remains a worthwhile future provider — controlled camera
and lighting, no personal-device dependency, no employee data cost — but it is
**less urgent than in Revision 1**, because the fingerprint terminals already
deliver the presence guarantee a kiosk was proposed to provide. Keep it as a
future adapter, not a Phase 2 decision.

---

# 20. Architecture Decision

## Extend the existing system into a modular monolith — with a Phase 0 foundation, a worker, and a device gateway.

The new context **strengthens** this conclusion rather than challenging it.

**Why not separate systems or microservices:** a per-provider service topology
would put a network boundary in the middle of a single transaction — ingest,
dedup, projection and audit must be atomic per event. Splitting them buys
distributed transactions and partial-failure handling to solve scaling and team
problems that do not exist at a handful of branches with a small team. The
providers are already isolated *inside* the process by the adapter interface,
which is the isolation that actually matters here.

**Why not a separate attendance application:** `Branch` is the spine of both
domains. Two systems means two sources of truth for the entity everything else
references — the worst possible split — plus two auth systems, two deployments,
and a stranded feedback system nobody maintains.

**What genuinely changes from Revision 1:**

1. **The device gateway is a new architectural component**, and its deployment
   shape (cloud endpoint vs on-prem branch agent vs batch) is unresolved pending
   §22 U1. This is the largest open question in the design.
2. **Pure serverless is now disqualified**, not merely awkward. The worker is
   mandatory, and Scenario B would require long-lived connections to branch LANs.
   The Docker path already in the repo is the target.
3. **Redis is removed from the architecture**, not deferred. Revision 2 planned
   it for Phase 5 nonces; that was wrong, not merely early — a Redis-backed
   nonce makes Redis a *correctness* dependency of clock-in. Postgres consumes
   the nonce in the same transaction as the attendance event, which no external
   store can. See [ADR 0002](./decisions/0002-no-redis.md).
4. **The engine core is genuinely provider-agnostic**, where Revision 1 assumed a
   mobile-shaped flow and treated other inputs as variations.

**Against the stated criteria:** *maintainability* — enforced module boundaries
beat both a sprawling monolith and a premature distributed system;
*scalability* — one Postgres plus a worker handles Basilissa's scale for years,
and boundaries preserve the extraction option; *security* — one auth system, one
authz layer, one audit log is materially easier to secure than several;
*separation of concerns* — achieved through module and adapter boundaries, which
is where it belongs at this size; *Odoo* — one integration point, one outbox, one
reconciliation job; *multi-branch* — a single `Branch` entity is the point;
*long-term direction* — an operations platform on a shared branch spine is a
coherent product.

---

# 21. Divergences from Stated Assumptions

Where this document's conclusions differ from the assumptions provided.

| # | Assumption | Conclusion | Why it matters |
|---|---|---|---|
| **D1** | Odoo owns employee master data | **Correct as a destination, impossible at launch.** The platform must temporarily own employee master with `masterSource` + nullable `odooEmployeeId` and a designed three-stage adoption path (§14.2). | Largest gap in the brief. Without it, the first deployment has no source of employees, and retrofitting identity ownership after records exist is materially harder. |
| **D2** | Providers behind a common interface | **Yes for transport and identification; no for verification semantics.** Events carry a three-axis assurance profile; rules reference assurance, not provider names (§6.2). | Flattening providers discards exactly the information payroll disputes need, and hard-codes provider names into business rules. |
| **D3** | Fingerprint is the *fallback*; mobile is primary | **They are co-primary with different trust profiles.** Fingerprint scores *higher* on identity and location, lower only on time (§6.2). | "Fallback" invites under-investment in the path that is more secure, already installed, and the fastest route to production value. |
| **D4** | Server time is authoritative (Revision 1) | **Per-provider time authority.** Terminals supply their own timestamps from locally settable clocks. Store `occurredAt`/`sourceReportedAt`/`recordedAt`/`clockSkewMs`; monitor drift as an SLO (§6.3). | Revision 1's rule was correct for mobile and would have been silently wrong for the first provider shipped. |
| **D5** | Device determines clock-in vs clock-out | **Derive direction server-side.** Punch-state buttons are routinely ignored in practice; the hint is stored and compared, never obeyed (§6.4). | A wrong device state silently becoming an authoritative clock-out is a payroll defect. |
| **D6** | Scheduling is Phase 7 | **Minimum viable scheduling must be Phase 1.** Phase 3 manager operations require late arrival, missing clock-outs and overtime, all undefined without scheduled times (§12). | Dependency inversion in the proposed sequence — Phase 3 is not buildable as specified. |
| **D7** | Redis in the foundation (Revision 1), then Phase 5 (Revision 2) | **Removed entirely.** Postgres serves queues, locks, sessions, rate limits and nonces. | Not just cost: a Redis-backed nonce would make Redis a correctness dependency of clock-in, breaking the rule that attendance survives optional infrastructure being down. [ADR 0002](./decisions/0002-no-redis.md). |
| **D8** | Device integration is code only | **May require an on-prem branch agent** if terminals are LAN-only or lack usable TLS (§7.2). | Drives hardware budget, deployment topology and field-support cost more than any code decision. Unresolved. |
| **D9** | Manual entry "heavily audited" | **Insufficient as a specification.** Needs reason codes, bounded windows, no self-entry, second-level approval, employee notification, rate metrics, and deliberate friction (§7.3). | It is the zero-verification path, available first, held by the role with the most local authority. |
| **D10** | *(not addressed in the brief)* | **Cross-provider duplicates need an explicit policy.** Highest assurance wins; the other is retained as `SUPERSEDED`; never dropped (§6.5). | Three capture paths guarantee the same action arrives twice. Silent dropping destroys the audit trail. |
| **D11** | Single `Status` column in the event table | **Split event verification outcome from day lifecycle state** (§8). | "Corrected" is not an alternative to "Valid". One column will mislead managers. |
| **D12** | Phase 8 integrates feedback | **Smaller than implied.** Role-scoped feedback access falls out of Phase 0 RBAC free; the real work is combined operational reporting. | Avoids over-scoping a phase that is mostly already done. |
| **D13** | Odoo is a sequential phase | **An externally gated parallel track.** Contract negotiation starts in Phase 0; implementation runs whenever Odoo is ready (§14, plan §Parallel Tracks). | Sequencing a phase behind another team's delivery blocks work that has no real dependency. |
| **D14** | Corrections change values | **Typed operations**: `ADJUST_TIME`, `INSERT_EVENT`, `VOID_EVENT`, `REASSIGN_BRANCH` (§9). | Missing punches and double punches are not field edits, and they are the common cases with hardware. |

**Accepted without reservation:** Odoo as a non-blocking async integration;
outbox with retries and explicit sync states; immutable events with derived day
projections; the provider/adapter abstraction; capability-independent deployment;
full source and method visibility; corrections preserving history; modular
monolith + worker.

---

# 22. Risks & Open Unknowns

**Investigate before committing to dates. Do not design around assumed answers.**

| # | Unknown | Blocks | Impact if wrong |
|---|---|---|---|
| **U1** | **Fingerprint terminals:** exact model, firmware, protocol/SDK, push vs poll, TLS capability, authentication mechanism, employee-sync capability, offline buffer size and overflow behaviour, timestamp semantics, clock-sync support, bidirectional feedback, concurrent-connection limits | Phase 2 entirely | Determines Scenario A/B/C (§7.2) — the largest cost and timeline variance in the programme |
| **U2** | **Branch network topology:** internet at each branch, static/dynamic IP, NAT, firewall control, VLAN segregation, uptime, ability to place on-prem hardware | Phase 2 | Forces Scenario B or C; adds per-branch hardware and field support |
| **U3** | **Odoo API contract:** REST vs XML-RPC vs JSON-RPC, auth mechanism, **idempotency support**, error taxonomy (retryable vs permanent), webhook availability, sandbox, rate limits, `hr.attendance` field mapping, amendment/period-close behaviour | Phase 4 | Idempotency absence forces query-before-retry (§14.4); no sandbox blocks safe testing |
| **U4** | **Odoo timeline and readiness** | Phase 4 scheduling | If far out, the platform runs standalone longer and Stage 1 employee ownership matters more |
| **U5** | **Employee identity mapping:** existing terminal enrolments, whether device user IDs are stable and documented, and where the current authoritative employee list lives (HR spreadsheet? payroll? Odoo draft?) | Phases 1, 2, 4 | Mis-mapping silently pays the wrong person; unknown source blocks Phase 1 data load |
| **U6** | **Existing employee data source and quality** — count, format, completeness, duplicates | Phase 1 | Determines import tooling and HR cleanup effort |
| **U7** | **Payroll rules:** overtime rates and thresholds, break policy (paid/unpaid, auto-deduct), grace periods, rounding rules, pay period boundaries, public holiday handling | Phases 1, 7 | Wrong calculation is a payroll incident, not a bug |
| **U8** | **Overtime policy:** approval authority, partial approval rules, escalation SLA, unapproved-but-worked treatment, dispute process | Phase 7 | Workflow shape and legal defensibility |
| **U9** | **Ghana biometric/privacy requirements** under Act 843: DPC registration status, lawful basis, consent form, DPIA requirement, retention limits, employee notice | Phase 6 | Can block face rollout entirely; must start in Phase 1 |
| **U10** | **Branch geo data:** actual coordinates, realistic radii for mall units, whether `location` strings map cleanly to real addresses | Phase 5 | Wrong radii cause mass false rejections |
| **U11** | **Employee smartphone ownership and data cost** across the workforce | Phase 5 | May invalidate mobile-first assumptions; makes terminals more central |
| **U12** | **Offline requirements:** acceptable capture-to-visibility latency, tolerance for delayed exceptions | Phases 2, 5 | Drives buffering, agent design, and manager UX |
| **U13** | **Facial recognition vendor:** demographic accuracy on this workforce, data-residency terms, liveness quality, cost at volume | Phase 6 | Accuracy failure on the actual workforce would make the feature unusable |
| **U14** | **Branch timezone assumption** — all Ghana (Africa/Accra, UTC+0, no DST) confirmed? | Phase 1 | If ever multi-country, `workDate` anchoring must be per-branch from the start |
| **U15** | **Runtime decision:** return to containers, or Vercel + separately hosted worker | Phase 0 | Blocks the worker foundation; Scenario B likely forces containers |

**Non-negotiable asks for the Odoo team (U3):** idempotency key support on
attendance create; an error taxonomy separating retryable from permanent; a
sandbox environment; documented `hr.attendance` field semantics; and defined
behaviour for amendments against a closed payroll period.

---

# 23. Overall Recommendation

**Extend the existing system into a capability-independent modular monolith,
with a Phase 0 foundation, a worker process, and a device gateway whose shape is
resolved by investigation before Phase 2 begins.**

The existing codebase is well-built for what it is — careful schema design,
correct timezone handling, disciplined validation, a working container pipeline,
sensible auth patterns. What it lacks is not quality but *scope*: no identity
model, no authorisation, no API surface, no jobs, no storage, no audit, no device
integration. Those are new foundations, not refactors. The honest framing:
you are building a new system that inherits a good database, a good design
system, a good deployment pipeline, and the `Branch` entity — and absorbs the
feedback module along the way. That inheritance is worth having, and `Branch`
alone justifies extending rather than starting over.

**Five things to carry into planning:**

1. **Solve the employee-master bootstrapping problem now** (§14.2, D1). It is the
   largest gap in the current assumptions, and the cost of retrofitting it rises
   with every employee record created.
2. **Reframe fingerprint as co-primary, not fallback** (D3). It is more secure on
   the axes the brief cares about, it is already installed, and it is the fastest
   credible path to production attendance.
3. **Resolve the device integration scenario before committing to a Phase 2
   date** (U1, U2). An on-prem branch agent is a different programme from a cloud
   endpoint, in budget, ops and timeline.
4. **Treat manual entry as the primary fraud surface**, not a convenience feature
   (§7.3, D9). It is the zero-verification path and it ships first.
5. **Verification must never prevent someone from working** (P6). Every rejection
   needs a recorded, flagged, reviewable fallback. A system that locks a cook out
   of their 5am shift will be worked around within a week — and then there is
   neither security nor data.

---

*Revision 2 prepared as a discovery exercise against commit `67481f5`. No code or
schema was modified in producing this assessment. Implementation sequencing lives
in the companion [Implementation Plan & Phases](./implementation-plan.md).*
