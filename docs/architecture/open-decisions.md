# Open Decisions & Provisional Values

> **What this is:** every place the system currently runs on a placeholder, a
> deferred decision, or an assumption — and what to change when the real
> information arrives.
>
> **Why it exists:** several values were chosen to unblock work, not because
> anyone decided them. A placeholder that nobody revisits quietly becomes
> policy, and that is worse than a hard-coded value because it looks
> deliberate. This is the list that prevents that.
>
> **Last reviewed:** 2026-09-06 · against `develop`
>
> Related: [Architecture Assessment](./attendance-platform.md) ·
> [Implementation Plan](./implementation-plan.md) ·
> [ADRs](./decisions/README.md)

---

## How to use this

Each entry says **where** it lives, **what it is now**, and **what to do**.
When you close one, delete it from here rather than marking it done — this
document should shrink.

Priority marks:

- 🔴 **Blocks go-live** — wrong or unset in production causes real harm
- 🟠 **Should close before the next phase depends on it**
- 🟢 **Fine to carry** — recorded so it is not forgotten

---

## A. Provisional values awaiting real information

### 🔴 A1 — Attendance policy defaults *(gates U7)*

**Where:** `attendance_policies` table (global row), defaults in
`prisma/schema.prisma`, fallback in `lib/modules/attendance/policy.ts`

Every value is a placeholder and the row is flagged `isProvisional: true`:

| Field | Current | Needs |
| --- | --- | --- |
| `graceInMinutes` | 5 | Real lateness tolerance |
| `graceOutMinutes` | 5 | Real early-departure tolerance |
| `overtimeThresholdMinutes` | 10 | Minutes past schedule before OT counts |
| `breakPolicy` | `EXPLICIT_PUNCH` | Do staff punch breaks, or is it deducted? |
| `autoDeductMinutes` | 30 | Only if `AUTO_DEDUCT` |
| `autoDeductAfterMinutes` | 300 | Only if `AUTO_DEDUCT` |
| `roundingMinutes` | 0 (off) | Whether payroll rounds at all, and how |
| `autoCloseGraceMinutes` | 0 | Grace before a missing clock-out auto-closes |
| `dedupWindowMinutes` | 5 | Window for cross-provider duplicates |
| `maxManualEntryDays` | 7 | How far back a manager may record attendance |

**What to do:** confirm each with whoever owns employment terms, set them via
the policy editor (HR or Super Admin), and clear `isProvisional`. Changing them
supersedes the current version rather than editing it, so past attendance keeps
resolving against the rules that applied when it was worked.

**Note on rounding:** off by default deliberately. Rounding is a payroll
decision, and rounding consistently downward is wage theft in slow motion.
Leaving it off is safe; turning it on must be a choice someone makes.

### 🔴 A2 — Branch coordinates *(gates U10, blocks geofencing)*

**Where:** `branches.latitude` / `.longitude` — all `NULL`

`geofenceEnabled` is `false` everywhere, so nothing is enforced. Radius
defaults to 150m and `maxAcceptableAccuracyMeters` to 100m, both guesses.

**What to do:** capture real coordinates per branch, then observe actual GPS
readings on site for a couple of weeks before fixing the radius. Mall units in
particular are larger than a naive 50m circle assumes.

### 🟠 A3 — Branch timezone assumption *(U14)*

**Where:** `branches.timezone`, default `Africa/Accra`

The column is per-branch precisely so the platform is not quietly
single-country, but every value is currently the default and nothing has
confirmed that all branches are and will stay in Ghana.

**What to do:** confirm. If a non-Ghana branch is ever added, `workDate`
anchoring must resolve per-branch — the column already supports it, the
calculation code must actually read it.

### 🟢 A5: Attendance is fully live in production

Attendance, scheduling, the policy editor, and aptitude tests have been promoted to fully live across all environments. Feature flags have been removed. Access is now governed entirely by role-based permissions and branch scoping.

### 🟠 A4 — Production environment values

**Where:** `.env` on the deploy target

`NEXT_PUBLIC_APP_URL` is `http://localhost:3001`, which is what QR codes and
notification email links are built from. `RESEND_API_KEY` is currently empty
(intentionally, after a test send).

**What to do:** set the real public URL wherever production is hosted. Set the
Resend key when notifications should resume — email is optional by design, so
leaving it unset only means notifications are skipped with a warning.

---

## B. Deferred by design — with the trigger that reopens them

### 🟢 B10 — HR assessments are their own models

**Where:** `lib/modules/assessments/`, `assessment_*` tables

Shares nothing with `Question` and the feedback tables. They look alike and are
different in every way that matters: feedback is anonymous, unscored, 1-5
ratings from customers with no right answer; an assessment is attributable,
scored against an answer key, and sat once by one named person. Reusing
`Question` would have meant a nullable `isCorrect`, a nullable section, and a
rating scale assessments never use.

**Tokenised per person, not one shared link.** A shared link cannot tell one
submission from another, cannot stop somebody sitting it twice, and cannot stop
it being sat on a colleague's behalf — HR would be scoring anonymous
submissions. Only the token hash is stored, as with password resets.

**Identity is declared, not proven.** The token decides who this is; what the
taker types is compared and recorded. A mismatch is flagged for HR rather than
refused, because a link can be forwarded and blocking on a misspelt name would
throw away a real submission. The mismatch is deliberately NOT reported back to
the taker — telling them would teach whoever is sitting it on somebody's behalf
what to type instead.

**Published assessments are frozen.** Structure and scoring cannot change once
published: two people who sat the same assessment must have sat the same
assessment. Wording stays editable for typos, and each answer additionally
snapshots its points, so a result reads the same in a year.

**Invitations are emailed when there is an address and email is configured**
(`lib/modules/assessments/jobs.ts`, `ASSESSMENT_INVITATION_SEND`) — the same
job-queue pattern as password resets. The link is always shown to HR too, so
nothing is silently lost when there is no address or email is not set up.

**A resend cannot reuse the link.** Only the token hash is stored, so the
original is unrecoverable; `resendInvitation` issues a new invitation and
revokes the old one, in that order, so a failure partway never leaves zero
live links. The UI says so, because "resend" implies otherwise.

**The raw token in the job payload is swept sooner than the password-reset
one.** An invitation lives a week by default, not the hour a reset token
lives, so leaving its send job around for the same reason password-reset jobs
are would leave a working token sitting in `jobs` for a week.
`purgeSentInvitationJobs` instead removes a SUCCEEDED send job at any age —
the email is already out, so the payload's copy of the token is redundant —
and a DEAD one only once it is older than the invitation would have lived
anyway. `purgeExpiredPasswordResets` does not (yet) apply the same
SUCCEEDED-vs-DEAD split; it is safe as is because a reset token's window is
so much shorter, but the tighter rule would suit it too.

**A pass mark (`passMarkPercent`) is optional, editable after publishing, and
not settable at creation.** Not structural — it is a threshold on scoring
that is already frozen, not the scoring itself — so it stays editable the way
title, description and score visibility already do. Not offered on the
create form: a threshold is meaningless before the points it is a threshold
of exist, and none do until questions are added. Absent means "no pass
mark," not zero — those are different claims, and only the first is true of
a diagnostic that was never meant to be pass/fail.

**Hiding the score hides the verdict too.** `showScoreToTaker: false` was
built to keep an assessment feeling like a diagnostic rather than an exam —
people compare results, and the honest answers stop arriving once they do. A
visible "pass"/"fail" invites exactly the same comparison a visible number
does, so the pass mark rides the same switch: a taker who is not shown their
score is not told whether they passed either. HR always sees both, since
`showScoreToTaker` only ever governed what the *taker* sees.

**Not built:** section-by-section stepping. Answers save as they are chosen,
so losing signal costs nothing, but everything is on one page grouped by
section.

### 🟢 B1 — `/api/v1` bearer-token API

**Status:** Built for external authentication integrations (Trello-style system).

Endpoints:
- `POST /api/v1/auth/login`: Authenticates with email & password, returning a 30-day signed Bearer JWT and user profile.
- `GET /api/v1/auth/me`: Verifies active session against database `Session` and `User.sessionVersion`.
- `POST /api/v1/auth/logout`: Revokes the session row immediately on server.

Tokens carry `userId`, `sessionId`, and `sessionVersion` signed via HS256 (`SESSION_SECRET`). Instant revocation is enforced on password/status change via `sessionVersion` or on demand via `revokedAt`. See `docs/integrations/trello-auth-guide.md` and OpenAPI spec at `/docs`.

### 🟢 B2 — `SyncOutbox`

**Deferred to:** Phase 4 (Odoo).

The job queue is already the transactional write path the outbox was meant to
provide, and nothing produces syncable records until Phase 3. Its shape will be
better known once Odoo's API contract is (U3).

### 🟢 B3 — Redis

**Removed, not deferred.** See [ADR 0002](./decisions/0002-no-redis.md).
Re-adding requires a new ADR answering the five questions with evidence —
specifically, measured rate-limit write volume after edge protection and the
per-instance pre-filter are both in place.

### 🟢 B4 — `ScopeType.REGION`

**Where:** `prisma/schema.prisma`, `ScopeType` enum

Only `GLOBAL` and `BRANCH` exist. Area managers hold one `BRANCH` assignment
per covered branch. An enum value no code can resolve is a silently-denying
dead branch.

**Trigger:** a `Region` entity, or enough branches that per-branch assignment
becomes unmanageable. Adding the value is then a one-line migration.

### 🟢 B5 — Branch-scoped attendance policy

**Where:** `attendance_policies.branchId` — nullable, always `NULL`

Resolution already prefers a branch row over the global one and is tested.
Only the UI is global-only.

**Trigger:** a branch that genuinely needs different terms. No migration
needed.

### 🟢 B6 — PostGIS

Circles are enough for tens of branches. **Trigger:** polygon fences — a mall
food court is genuinely not a circle.

### 🟢 B7 — "Exactly one primary branch" as a database constraint

**Where:** `employee_branch_assignments.isPrimary`

A partial unique index would enforce it, but Prisma cannot express one, so it
would appear as schema drift — and `migrate diff` reporting *no drift* is the
check that has been catching hand-written SQL mistakes. Enforced in the service
layer instead.

**Trigger:** Prisma supporting partial indexes, or evidence of the invariant
actually being violated.

### 🟢 B9 — Active device identity uniqueness is service-layer

**Where:** `employee_device_identities`

Only the ACTIVE identity for `(providerType, externalId)` may be unique — a
leaver's terminal slot is legitimately reassigned to a new hire, so a plain
unique constraint would make rehiring impossible. Postgres expresses that as a
partial unique index, which Prisma cannot declare, so it would show as
permanent drift and `migrate diff` reporting *no drift* would stop being the
check that catches hand-written SQL mistakes.

Same trade-off and same answer as B7. Enforced in the service layer when
enrolment is built in Phase 2; the table is empty until then, so nothing is
currently relying on it.

**Trigger:** Prisma supporting partial indexes, or a duplicate active identity
actually appearing.

### 🟢 B8 — Per-branch feedback questions

**Where:** `questions.order` is globally unique

**Trigger:** wanting different questions per branch. Becomes
`UNIQUE(branchId, order)` with a nullable `branchId`.

### 🟢 B11 — Aptitude tests have no dedicated `Candidate` table

**Where:** `lib/modules/aptitude/`, `aptitude_invitations`

`AptitudeInvitation` holds `candidateName`/`candidateEmail` as freeform
fields, the same pattern `AssessmentInvitation` already uses for a
non-employee invitee, rather than a `Candidate` model with its own identity.
Deliberate for v1: nothing today needs to search or de-duplicate candidates
across tests or postings, and inventing that table speculatively risks
guessing its shape wrong.

**Trigger:** HR wanting to ask "has this person taken any aptitude test
before", de-duplicate applicants across postings, or attach anything to a
candidate that outlives one invitation (notes, a hiring stage, a résumé).
Adding a `Candidate` model then and pointing `AptitudeInvitation.candidateId`
at it is a straightforward additive migration — nothing about the current
shape blocks it.

---

## C. Built but not finished

### 🟠 C1 — Branch scoping: the any-branch gate exists; reaching it does not, yet

**Scoped:** employees, attendance, branches (list, detail, edit, per-branch QR)
and the feedback list. Each constrains inside the query, so a branch-scoped
caller cannot reach another branch's row even by id.

Two helpers carry it: `branchWhere` filters a list, `coversBranch` answers
"may I touch this one". The second is what a write needs, and it is the one
that matters — a Server Action is reachable by direct POST without ever
loading the page that lists what you own.

`feedbackListWhere` and `dayWhere` (attendance) are pure functions purely so
the dangerous version is testable. Merging the reader's filters over their
scope lets `?branchId=` replace the scope's clause and widen the query;
intersecting, via `AND`, cannot. `dayWhere` used to do the dangerous version —
`{ ...scopeWhere(scope), ...(branchId ? { branchId } : {}) }` — which nothing
caught because reaching it required a GLOBAL grant, and a GLOBAL grant has no
scope for `?branchId=` to escape. Fixed alongside the gate below, since
switching the gate is what would have turned it from dead code into a real
hole.

**The third gate — `requireAnyBranchPermission`
(`lib/modules/identity/dal.ts`) — now exists** and is wired into all four
list pages (branches, feedback, employees, attendance), replacing the
`requirePermission(p)` that demanded a GLOBAL grant outright. Verified against
real data, not just the pure functions in isolation: a constructed
BRANCH-scoped actor's unfiltered feedback query returned only their branch's
real rows, and `?branchId=` for a branch with real submissions in it — genuine
rows, confirmed present — still came back empty.

**Not scoped, deliberately:** feedback questions are global until B8 makes them
per-branch.

**Still not reachable through the actual admin UI, and this is the part that
was not known when C1 was last written.** Every role that carries
`admin:access` — HR, ADMINISTRATOR, SUPER_ADMIN — carries it bundled with
`branch:read`/`feedback:read`/`employee:read`/`attendance:read` in the *same*
role, and a role's permissions all take the scope of the assignment. There is
no way, with today's role matrix, to hold `admin:access` and a BRANCH-scoped
grant for those four permissions at once: granting `admin:access` at BRANCH
scope does not satisfy `requireAdminShell`'s check, which demands GLOBAL by
the same "naming no branch must never widen access" rule as everything else —
and granting it at GLOBAL scope, through any role that has it, makes the four
list permissions GLOBAL too, in the same assignment. Confirmed directly:
signing in as a real `BRANCH_MANAGER` reaches `/admin/no-access` before ever
touching a list page, refused by the shell layout, not by anything this
change touched.

**Decided: not now.** Between decoupling `admin:access` from the shell gate
and giving branch-scoped managers a narrower surface that isn't `/admin` at
all, chosen the second by not building the first — there is no branch-scoped
user yet who needs either, and reworking the shell gate ahead of a real
consumer risks building the wrong shape. Revisit when a branch manager
actually needs to sign in to something; until then the gate and the four
scoped list pages stand ready, unused.

### 🟢 C2 — `requireAdmin()` is gone

**Status: done.** Every page, Server Action and route handler applies the
specific permission it needs. `requireAdmin` has no callers and was deleted.

`admin:access` survives as the admin shell gate only — it decides whether the
navigation is shown, never what may be done.

Two things changed hands, and both were the point rather than a side effect.
**HR lost branches and feedback questions:** they keep `admin:access` because
they own employees and attendance policy, and the coarse gate had been letting
them rewrite the customer feedback form as well. **Area managers gained
`branch:write`** without gaining the admin shell — which only matters because
a Server Action is reachable by direct POST, so the gate on the action is the
real one. Their grant is branch-scoped, and `createBranch` demands a global
grant: authority to run a branch is not authority to invent one.

### 🟢 C4a — Role history lives in the audit log, not the assignment table

**Where:** `role_assignments`, `@@unique([userId, role, scopeType, scopeId])`

Re-granting a previously revoked role reactivates the same row rather than
inserting a second one, because the unique key makes two rows impossible. So
the table shows the CURRENT grant and its latest period, not the full history
of grants and revocations.

The history is not lost — `user.role_granted` and `user.role_revoked` audit
entries record both sides of every change, and `audit_logs` is append-only.
But anyone reading `role_assignments` directly should know it is a current-state
table, not a ledger.

**Trigger for revisiting:** a requirement to show "held this role from March to
June, and again from September", which the audit log can answer but only by
reconstruction.

### 🟢 C3 — `admin_users` retained read-only

**Where:** `prisma/schema.prisma`, marked deprecated

Every row was migrated to `users` with ids and password hashes preserved,
verified against real data. Retained for one release so the migration can be
checked in production before anything is unrecoverable.

**What to do:** drop it in a follow-up migration once production has been
verified.

### 🟢 C4 — Error tracking has a seam but no vendor

**Where:** `setErrorSink()` in `lib/platform/logger.ts`

Structured logs go to stdout, which every host collects. Nothing aggregates
errors.

**What to do:** if a hosted tracker is wanted, implement one function — every
existing `logger.error` call starts reporting, no call sites touched. It is a
vendor and a cost, so the choice is deliberately not made here.

### 🟢 C5 — Module boundary allowlist is growing

**Where:** `PUBLIC_ENTRIES` in `eslint.config.mjs`

Private-by-default with an allowlist of public entry-file names. It has been
extended three times, once per pure-rules file added — `authorization`,
`policy`, then `assurance` and `events` together. Each time the rule correctly
blocked a legitimate import and the fix was to widen the list.

The list is enumerating the wrong side. What is genuinely private is a small,
recognisable set — services, repositories, anything importing `server-only` —
while public files are open-ended.

**Trigger:** the next time it needs extending. Invert to marking private files
by convention, e.g. `lib/modules/<name>/internal/`, so adding a public file
needs no config change.

### 🟠 C6 — Encryption key is derived from `SESSION_SECRET`

**Where:** `lib/platform/secret-box.ts`

MFA seeds are encrypted with a key derived from `SESSION_SECRET` via HKDF. That
is meaningfully better than plaintext — a leaked database dump yields nothing
without the application environment — but it is not a KMS, and it has one
consequence:

> **Rotating `SESSION_SECRET` makes every encrypted secret unreadable.**

For MFA that means every enrolled user must re-enrol, which is recoverable but
not a quiet event. Phase 6 introduces biometric templates, which are *not*
recoverable that way.

**Trigger:** before Phase 6. Move to a managed key with real rotation.

### 🟢 C7 — Session IP is not recorded

**Where:** `sessions` table stores `userAgent` only

Omitted deliberately rather than by oversight: collecting it is a decision that
needs a retention policy, and it is not needed to operate the product.

**What to do:** revisit if a security investigation requirement appears, with a
documented retention period.

---

## D. Planned but not built

Honest gaps — listed in the Phase 0 plan, not delivered.

### 🟢 D1 — MFA is enforced

**Status: done.** Enrolment, sign-in challenge, recovery codes, encrypted
secrets, enforcement and an administrator reset are all in place.

Enforcement withholds privileged pages rather than refusing the sign-in:
someone in a required role signs in normally and is redirected to
`/admin/security`, which uses `requireAuth` and so stays reachable. That
sidesteps the grace-period question entirely — nobody is locked out, and
nothing privileged is reachable before the factor exists.

**This was broken when first shipped and is now fixed.** The enrolment page
uses `requireAuth`, but the shared admin layout above it used
`requirePermission`, so the redirect target redirected to itself and every
affected user lost the admin area entirely. The layout now uses
`requireAdminShell`, which checks `admin:access` without the MFA gate, and
`tests/mfa-enforcement.test.ts` fails if that regresses.

The lesson worth keeping: the enforcement was verified only against
unauthenticated requests, which redirect to the login page long before any of
this runs. That test could not have caught it, and passing it proved nothing.

**One consequence to be aware of:** anyone holding `SUPER_ADMIN`, `HR` or
`ADMINISTRATOR` is sent to enrolment on their next sign-in and cannot reach the
dashboard until they finish it.

Resetting is permissioned (`user:write`), audited under its own action, bumps
`sessionVersion`, and refuses self-reset — someone with a live session but no
second factor must ask a colleague, which is the situation MFA exists to
survive.

### 🟢 D2 — Password reset

**Status: done.** `/admin/forgot-password` → emailed single-use link →
`/admin/reset-password`. The link lasts an hour, requesting another retires the
previous one, and redeeming it bumps `sessionVersion` so every existing session
ends — a reset prompted by someone else knowing the password accomplishes
nothing if their session survives it.

**It does not sign you in.** Access to an inbox would otherwise be enough to
walk past a second factor; sending people to the sign-in form keeps the MFA
challenge in the path.

**Every outcome looks identical** — unknown address, suspended account, live
super admin, rate-limited. The addresses are staff names at a known employer,
so a form that distinguishes them is a roster and a list of who has been
suspended. Rate limited per address (3/hour, against mailbox flooding) and per
IP (10/15min, against walking a list).

**Only the hash is stored.** SHA-256 rather than bcrypt: the cost factor exists
to slow brute force against secrets humans chose, and this is 256 random bits.

**One unavoidable exposure, bounded rather than eliminated:** the send job
carries the token itself in its payload, because only the hash is stored and
there is nothing to reload. The worker's periodic sweep deletes expired tokens
and these job rows past their TTL (`purgeExpiredPasswordResets`).

**Operational trap, made loud:** with email unconfigured the person sees "a
link is on its way" and nothing arrives. The send job throws
`PermanentJobError` in that case, so it dead-letters with a message saying
recovery does not work until email is configured — the only honest signal
available, since the queue cannot tell them directly. See E2.

### 🟢 D3 — Attendance policy editor

**Status: done.** `/admin/attendance/policy`, gated on `policy:read` with the
Server Action re-checking `policy:write` separately — actions are reachable by
direct POST, so the page check is a convenience and not the boundary.

Shows the current values, the `isProvisional` warning at the top, the full
version history, and requires a reason on every change. The reason is stored on
the version and in the audit entry, and is deliberately not a policy field: it
describes the change, not the rules, so it takes no part in resolution and
never appears in the diff of what actually moved.

Versions written before the reason column say so in the history rather than
showing a blank, and were not backfilled — inventing "migrated" would make an
absence look like an answer.

**Known limit:** a ten-character minimum stops the reflexive non-answer and
nothing more. No length rule can force a useful reason; what does the real work
is the reason being permanently attached to the version and read by whoever
asks later.

**Still SQL-only:** branch-scoped overrides. The column and resolution order
exist (see B5); the editor writes the platform-wide policy only.

---

## E. Follow-ups found along the way

### 🟢 E1 — A failed notification email fails its job

**Status: done.** `sendEmail` still never throws — an outage at the provider
must not fail a customer's submission — but it now returns
`sent | skipped | failed` instead of swallowing the outcome, and the job acts
on it. `skipped` covers running without a Resend account, which is a supported
deployment rather than a fault.

Retryable failures throw an ordinary `Error` and take the queue's normal
backoff. Failures no retry can fix throw `PermanentJobError`, a new queue
concept that dead-letters immediately with attempts to spare — five identical
rejections only delay the moment somebody looks. The row is kept either way.

**Where the line falls, and why it errs one way:** permanent means the request
itself is unacceptable — `validation_error`, `invalid_parameter`,
`missing_required_field`. Everything else retries, including credentials and
rate limits, and including error codes we do not recognise. Retrying a hopeless
job wastes a few attempts; giving up on a recoverable one loses the message.
Bad credentials in particular are worth retrying, because a human can correct
the environment while attempts remain.

### 🟢 E2 — Worker host: Railway

**Where:** [ADR 0001](./decisions/0001-runtime-topology.md) §1

Same Docker image as `app`, same repo, deployed as its own Railway service
with `PROCESS_ROLE=worker` (`docker/start.sh` branches on it) — no custom
start command, no public domain, no exposed port. Still manual, and worth
closing: `DATABASE_URL` and `SESSION_SECRET` have to be copied to Railway by
hand and kept in sync with Vercel's values whenever either changes — a
drifted value between them is a silent failure.

### 🟠 E3 — Neon cost changes once the worker runs

**Where:** ADR 0001, cost consequence

Neon autosuspends idle compute; a polling worker prevents that permanently,
moving billing from bursty to always-on. Poll interval is therefore a cost
parameter (currently 60s).

**What to do:** re-run Neon vs Railway Postgres against the actual plan before
the worker ships.

### 🟢 E4 — No worker liveness signal beyond logs

The worker's container healthcheck is disabled deliberately — it serves no
HTTP, and a permanently red check teaches you to ignore the column. It logs
queue depth, dead jobs and backlog warnings every tick.

**What to do:** once time-driven work exists (Phase 1 settlement), a dead
worker matters even with an empty queue. Add a heartbeat then, not now.

---

## F. Unknowns that gate future phases

Tracked in full in the [Implementation Plan](./implementation-plan.md); listed
here so everything open is in one place.

| ID | Unknown | Gates | Status |
| --- | --- | --- | --- |
| **U1** | Fingerprint terminals: model, protocol, TLS, offline buffer, clock sync | Phase 2 entirely | Open — physical inspection needed |
| **U2** | Branch network topology; can on-prem hardware be sited | Phase 2 | Open — decides cloud endpoint vs per-branch agent |
| **U3** | Odoo API contract, **especially idempotency support** | Phase 4 | Open — non-negotiable ask |
| **U4** | Odoo timeline | Phase 4 scheduling | Open |
| **U5** | Existing terminal enrolments; where the authoritative employee list lives | Phases 1, 2, 4 | Open |
| **U6** | Employee data quality: count, format, duplicates | Phase 1 | **Closed** — a real Odoo `hr.employee` export (254 rows: Department, Employee Name, Job Position, Work Email, Work Phone) shaped the CSV/XLSX importer. "Employee Name" is `SURNAME GIVEN_NAME(S)`; "Department" resolves to a branch via an explicit map, falling back to Head Office |
| **U7** | Payroll rules | Phases 1, 7 | **Partly unblocked** — configurable via A1, still needs real values |
| **U8** | Overtime policy: approval authority, escalation SLA | Phase 7 | Open |
| **U9** | Act 843 requirements, DPIA, consent | Phase 6 — hard gate | Open — longest lead item, start early |
| **U10** | Real branch coordinates and radii | Phase 5 | Open — see A2 |
| **U11** | Employee smartphone ownership and data cost | Phase 5 | Open — may change mobile's priority |
| **U12** | Acceptable capture-to-visibility latency | Phases 2, 5 | Open |
| **U13** | Face vendor: demographic accuracy on this workforce | Phase 6 | Open |
| **U14** | All branches Africa/Accra | Phase 1 | Assumed — see A3 |
| **U15** | Runtime topology | Phase 0 | **Closed** — ADR 0001 |
