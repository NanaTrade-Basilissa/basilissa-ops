# Basilissa Operations Platform — Handover & Status (24 September 2026)

This document is the authoritative summary of the current engineering state, what has shipped, and the remaining code-related implementation tasks. It pairs with [`architecture/open-decisions.md`](./architecture/open-decisions.md) and [`architecture/implementation-plan.md`](./architecture/implementation-plan.md).

---

## 1. Current State & CI Status

* **Git Remote**: `origin/main` is up to date (`NanaTrade-Basilissa/basilissa-ops.git`).
* **Test Suite**: **70 test files, 818 unit & integration tests passing** (`npm test`).
* **Static Analysis**: 0 TypeScript compilation errors (`tsc --noEmit`), 0 ESLint warnings (`npm run lint`).
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
* **MFA Enforcement**: Enforced for `SUPER_ADMIN`, `HR`, and `ADMINISTRATOR` using RFC-compliant TOTP secrets.
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
* **Automated Shift Reminders & Push Notifications**: Background sweep (`lib/modules/attendance/reminders.ts`) evaluates upcoming shifts 15–60 mins out and dispatches Expo push notifications via `lib/platform/push.ts`. Mobile app registers push tokens via `/api/v1/notifications/push-token` and handles local alerts in `core/services/notifications.ts`.

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
│    • Rotating shift patterns and rota builder (shift_patterns)         │
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
* **Rotating Rotas (`shift_patterns`)**:
  * Multi-week recurring schedules (e.g. 4 days on, 2 days off, alternating shifts).
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
