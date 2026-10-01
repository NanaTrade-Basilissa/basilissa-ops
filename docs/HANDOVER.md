# Basilissa Operations Platform — Handover & Status (1 October 2026)

This document is the authoritative summary of the current engineering state, what has shipped, and the remaining code-related implementation tasks. It pairs with [`architecture/open-decisions.md`](./architecture/open-decisions.md) and [`architecture/implementation-plan.md`](./architecture/implementation-plan.md). For how the system fits together, start at [`README.md`](./README.md) and [`context/`](./context/).

## 0. The next task

**Announcements phases 3 and 4**, specified in [`specs/announcements.md`](./specs/announcements.md). Phases 1 and 2 are built (1 October 2026, branch `feat/announcements`): compose, audience rules, history, the staff inbox with its mobile endpoints, and push through a fan-out job. Still to build: email and SMS channels (phase 3) and the urgent banner with acknowledgement (phase 4). The questions the spec lists for the business (who may send urgent, SMS budget, acknowledgement deadlines, retention) should be answered before phase 3 and 4. The mobile app also needs its Notifications screen, which is in a separate repository.

**Built but not yet migrated in production:** public holidays and cover shifts (register D4), rota patterns (D5), and announcements (D6). Each register entry has its production steps; D6's includes redeploying the worker.

---

## 1. Current State & CI Status

* **Git Remote**: `origin/main` is up to date (`NanaTrade-Basilissa/basilissa-ops.git`).
* **Test Suite**: **77 test files, 942 tests passing** (`pnpm test`, verified 1 October 2026).
* **Static Analysis**: `pnpm typecheck` and `pnpm lint` both exit 0 (verified 1 October 2026).
* **Branches**: `develop` and `main` are identical at `4b860c3`.
* **Worker & Container Deployment**:
  * Multi-arch `linux/amd64` Docker images built and pushed:
    * Docker Hub: `akwawcobbold/ac-ops-worker:latest`
    * GCP Artifact Registry: `africa-south1-docker.pkg.dev/utility-grin-461500-q9/docker-repo/ac-ops-worker:latest`
  * Redundant background worker runtime: deployed on **Railway** and **Google Cloud Run** to ensure zero downtime.
* **Database**: Neon Serverless PostgreSQL 16 (live and connected).

---

## 2. What Is Built & Operational

### A. Core Platform & Identity
* **Multi-Tier Authorization (RBAC)**: `can(actor, action, resource)` DAL guards with `GLOBAL | REGION | BRANCH` scope support.
* **MFA**: Enforced for `SUPER_ADMIN`; recommended (prompted, not blocking) for `HR` and `ADMINISTRATOR`. RFC-compliant TOTP, recovery codes, administrator reset. See `MFA_REQUIRED_ROLES` in `lib/modules/identity/constants.ts`.
* **Custom roles**: Roles screen with a permission matrix; custom roles are built from the granular permission registry (`lib/modules/identity/permissions.ts`).
* **Session Management**: Stateful session tracking in database with server-side instant revocation via `sessionVersion`.
* **Audit Ledger**: Append-only audit log tracking mutations across all domains.
* **Postgres Job Queue**: Durable job queue using PostgreSQL row-level locks (`FOR UPDATE SKIP LOCKED`) with exponential backoff and dead-letter handling.

### B. Email Transport & Notification System
* **Nodemailer Gateway API**: Dispatches via `https://nana-trade-server.vercel.app/email` (`lib/platform/email.ts`).
* **Dynamic Senders**: Real branch names for feedback (`from: payload.branchName`), `"Basilissa HR"` for candidate test invites, `"Basilissa Admin"` for staff invites/resets.
* **NanaTrade Protocol Templates**: Full responsive React Email Protocol design system (`lib/email-templates/layout.ts`, `feedback.ts`, `assessments.ts`, `aptitude.ts`, `identity.ts`).

### C. Slack Operational Alerting (`lib/platform/slack.ts`)
* Structured Slack incoming webhook notifications connected to:
  * **Email Gateway Failures**: Alerts when Nodemailer gateway returns errors or times out.
  * **Worker Dead-Letters**: Alerts when a job exhausts its 5 retry attempts and transitions to `DEAD`.
  * **Worker Fatal Crashes**: Alerts if worker process encounters an unhandled rejection.
  * **Terminal Punch Quarantines**: Alerts when a punch arrives from an unregistered serial number or unmapped PIN.
  * **SMS OTP Gateway Errors**: Alerts when mobile staff login OTP dispatch fails.

### D. Biometric Hardware Ingest (`app/iclock/cdata/route.ts`)
* Native support for **ZKTeco K40 Pro** ADMS push protocol.
* `GET /iclock/cdata`: Handles device handshake and pushes `TimeZone=Africa/Accra` config to prevent hardware clock resets.
* `POST /iclock/cdata`: Ingests batch `ATTLOG` attendance punches, maps terminal serial + employee PIN, strips raw biometric templates, and routes unmapped entries to quarantine.

### E. Attendance Engine Core (`lib/modules/attendance/`)
* **Unified Pipeline**: Normalized `IngestCommand` abstraction across mobile, biometric, and manual sources.
* **Server-Derived Direction**: Clock-in vs. clock-out is determined by an Accra-anchored state machine over employee punches, ignoring unreliable physical button states.
* **Cross-Provider Deduplication**: 5-minute sliding window that keeps the highest-assurance punch canonical and marks duplicates `SUPERSEDED` without data loss.
* **Pure Day Projections**: `AttendanceDay` calculations are 100% deterministic and recomputable from raw immutable events.

### F. HR Assessments & Aptitude Testing (`lib/modules/assessments/`, `lib/modules/aptitude/`)
* Timed question sections, anti-cheat detection, and auto-submit background sweeps.
* Tokenized, single-use public taker URLs sent automatically via email.
* Pure scoring engine with configurable pass marks and taker visibility rules.

### H. Branch Manager Operations & Real-Time Screens (`app/admin/(dashboard)/attendance/`)
* **Scoped Dashboard Root**: `app/admin/(dashboard)/page.tsx` applies `branchScope(actor, "attendance:read")` across branch queries, headcounts, and today's attendance records.
* **Live "Who's In / Who's Late" Floor Screen**: Interactive board (`components/admin/live-floor-board.tsx`) under the **Live Floor** tab (`?view=live`), displaying real-time headcounts (Clocked In, Late, Scheduled, Absent) and current staff punch status.
* **Exceptions Queue UI**: Dedicated screen (`components/admin/exceptions-table.tsx`) under the **Exceptions** tab (`?view=exceptions`) with one-click resolution modal (`components/admin/resolve-exception-dialog.tsx`) for missing clock-outs/ins, auto-closed shifts, and out-of-geofence punches.
* **Interactive Attendance Correction UI**: Modal dialog (`components/admin/attendance-correction-dialog.tsx`) supporting typed operations (`ADJUST_TIME`, `VOID_EVENT`, `INSERT_EVENT`) with before-and-after timestamps, controlled reason codes, and manager sign-off.
* **Automated Shift Reminders & Push Notifications**: Background sweep (`lib/modules/attendance/reminders.ts`) evaluates upcoming shifts 15–60 mins out and dispatches push notifications via `lib/platform/push.ts` (Firebase Cloud Messaging and Expo tokens). Mobile app registers push tokens via `/api/v1/notifications/push-token` and handles local alerts in `core/services/notifications.ts`. Leave decisions also push.

### J. Announcements and the staff inbox (`lib/modules/announcements/`, `lib/platform/inbox.ts`)
* **Dashboard**: `/admin/announcements` (history), `/admin/announcements/new` (compose with a live recipient count and a confirmation), `/admin/announcements/[id]` (who received it, who has read it, push status per person). Permissions `announcement:read` and `announcement:write`; branch-scoped roles can address only their own branches.
* **Audience**: Everyone (company-wide grant only), Branches, or Specific people, resolved once at send time into a stored recipient list. Pure rules in `audience.ts`.
* **Staff inbox**: one `notifications` table for every kind of notice. Leave decisions and shift reminders now write inbox rows too. Mobile endpoints under `/api/v1/notifications` (list with an Announcements filter, unread count, mark read, read all).
* **Push**: the `announcements.fanout` job (registered in `worker/registry.ts`) sends in chunks, records each person's outcome, and is safe to retry.

### I. Scheduling, leave and devices
* **Shifts, assignments and rota**: weekly grid, copy week, bulk assign, one-day overrides, rota patterns with a per-branch Auto rota switch (off by default), public holidays with the bundled Ghana calendar, cover shifts. See `lib/modules/attendance/{schedule,patterns,holidays,cover}.ts` and register D4, D5.
* **Leave requests**: submitted from the app, reviewed in admin (`app/admin/(dashboard)/leave`).
* **Device registry**: fingerprint terminals registered and monitored (`devices`, `DeviceLog`, heartbeat); employees linked to terminal PINs.
* **Store compliance**: public `/privacy` and `/delete-account` pages; an app-store review demo account (register A7).

---

## 3. What Is Left to Implement (Code-Related Backlog)

This is the exact list of remaining unbuilt code deliverables:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        REMAINING CODE DELIVERABLES                     │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Mobile App Security & Hardening (basilissa-employee-app)            │
│    • Mock-location / fake GPS spoofing detection                       │
│    • Single-use server challenge/nonce endpoint (/api/v1/.../challenge)│
│                                                                        │
│ 2. Biometric Device Background Probes                                  │
│    • Device clock-drift probe job (device-clock-drift-check)           │
│                                                                        │
│ 3. Phase 7: Advanced Workforce Scheduling & Overtime Workflow          │
│    • Rota patterns: built 1 Oct 2026 (register D5)                     │
│    • Formal overtime approval queue (partial approval & reason notes)  │
│    • In-app attendance dispute submission flow                         │
│                                                                        │
│ 4. Deferred Integrations (Waiting on External Prerequisites)           │
│    • Phase 4: Odoo ERP sync (Outbox drainer to hr.attendance)          │
│    • Phase 6: Facial verification engine (Deferred pending Act 843)   │
└────────────────────────────────────────────────────────────────────────┘
```

### Detailed Breakdown of Remaining Items:

#### 1. Mobile App Security Hardening (`basilissa-employee-app`)
* **Mock-Location Detection**:
  * Validate `expo-location` mock location flags on Android and inspect location jitter/speed to reject spoofed GPS coordinates.
* **Cryptographic Nonce / Challenge Endpoint**:
  * Endpoint issuing a single-use 60s nonce bound to `userId + deviceId` before punching, preventing replay attacks.

#### 2. Biometric Device Background Probes
* **Clock Drift Probe Job**:
  * Scheduled background worker probe comparing terminal push timestamps against server time to alert on drifting physical clocks.

#### 3. Advanced Scheduling & Overtime Workflow (Phase 7)
* **Public holidays and cover shifts — built (1 Oct 2026), not yet migrated in production.**
  See register entry D4 for the rule and the three production steps.
* **Rota patterns and Auto rota — built (1 Oct 2026), not yet migrated in production.** See register entry D5. Which branches run Auto rota is a business decision; it is off everywhere by default.
* **Overtime Formal Approval Workflow**:
  * Overtime request queue with partial approval, mandatory rejection reasons, and escalation rules.
* **Dispute Submission**:
  * In-app flow allowing staff to challenge an incorrect lateness deduction or missing punch for HR review.


---

## 4. Operational & Configuration Checklist (Non-Code)

These items are handled via the Admin Web UI and do not require code changes:
* [ ] **Lock Down Payroll Policies (Open Decision A1)**: Set real lateness grace, overtime threshold, and break deduction rules in the admin policy editor.
* [ ] **Set Branch GPS Geofences (Open Decision A2)**: Enter accurate latitude, longitude, and radii (100m–150m) for all active branches in the branch editor.
* [ ] **Review Quarantined Terminal PINs**: Ensure all staff using the fingerprint terminal have their physical PINs linked to their employee profiles.
