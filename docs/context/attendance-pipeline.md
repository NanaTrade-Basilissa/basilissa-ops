# Attendance pipeline

From a finger on a sensor (or a tap in the app) to the figures payroll reads.
This is the highest-stakes code in the repository: its output becomes wages.
Read this before changing anything under `lib/modules/attendance/`.

Deep reasoning lives in the
[architecture assessment](../architecture/attendance-platform.md) and the
[implementation plan](../architecture/implementation-plan.md) (phases 1, 2, 3,
5, 7). This page is the working map.

## The principle

```
 immutable facts  ->  pure rules  ->  derived day
 (events, corrections)   (policy, schedule)   (rewritable, recomputable)
```

1. **Facts are never edited.** An event is appended. A correction voids and
   inserts. Postgres triggers refuse UPDATE and DELETE on `attendance_events`.
2. **Rules are pure.** `assurance`, `events`, `policy`, `schedule`,
   `projection`, `manual`, `corrections`, `overtime-auth` do no I/O, so they are
   tested exhaustively without a database.
3. **The day is derived.** `AttendanceDay` is recomputed from facts plus the
   rules and schedule in force. Fix a bug by replaying, never by patching rows.
   `PROJECTION_VERSION` (`settle.ts`) marks which logic produced a day.

If a change breaks any of these three, stop and reconsider.

## Capture paths (providers)

Declared once in `providers.ts` (capabilities) and `assurance.ts`
(`PROVIDER_BASELINE`). The pipeline reads declarations, it never branches on a
provider name.

| Provider | Who | Time authority | Identity | Notes |
| --- | --- | --- | --- | --- |
| `MOBILE_APP` | Employee, in the app | Server | `DEVICE_BOUND` (proves the device, not the person) | GPS, geofence checked server-side. Offline punches sync later. |
| `FINGERPRINT` | ZKTeco K40 Pro | Device clock (skew recorded), `DEVICE_UNVERIFIED` until drift is measured | `BIOMETRIC` | ADMS push. Template data is stripped, never stored. |
| `MANAGER_MANUAL` | A manager | Actor-asserted | `NONE` | Least verified path in the system. Guard rails in `manual.ts`. |
| `SYSTEM_AUTO_CLOSE` | The sweep | Server | `NONE` | Real event, flagged `AUTO_CLOSED`. |

Facial verification (phase 6) is deferred pending legal review (Act 843).

### Mobile (`mobile.ts`, `app/api/v1/attendance/punch`)

`recordMobilePunch` in order: employee exists and is active; employee is
assigned to the branch **or** holds a cover shift there (`cover.ts`); branch
geofence is read; geofence decision (`OUTSIDE` rejects a clock-in); for
clock-ins, refuse if today's shift is already completed or none is scheduled
(skipped for the review demo account); build a stable idempotency key (30 second
bucket, so double-taps collapse); build an `IngestCommand`; call `ingestEvent`.
Error codes: `EMPLOYEE_NOT_FOUND`, `EMPLOYEE_NOT_ACTIVE`, `BRANCH_NOT_ASSIGNED`,
`BRANCH_NOT_FOUND`, `OUTSIDE_GEOFENCE`, `SHIFT_ALREADY_COMPLETED`,
`NO_SCHEDULED_SHIFT`, `INGEST_FAILED`. `punch/sync` replays an offline queue.

### Terminal (`device-ingest.ts`, `app/iclock/cdata`)

`GET` is the ADMS handshake; it also pushes `TimeZone=Africa/Accra` to stop the
hardware clock drifting. `POST` carries `ATTLOG` batches. Each row is parsed
(`parseAttlogBody`), the serial number is resolved to a registered `Device`, the
PIN to an `EmployeeDeviceIdentity`, and the row becomes an `IngestCommand`.
Anything that cannot be attributed is **quarantined, not dropped** (reasons
`MALFORMED_ATTLOG_LINE`, `UNREGISTERED_DEVICE`, `UNMAPPED_DEVICE_IDENTITY`) and
alerts Slack. Measured behaviour of the real hardware is in
[device-investigation-findings](../architecture/device-investigation-findings.md).

## The ingest pipeline (`ingest.ts`, `ingestEvent`)

Provider-agnostic. Every path arrives as an `IngestCommand`. Steps, in order:

1. **Replay check**, before any validation. A retry returns the original event
   even if rules changed since, so a network retry is never rejected for a
   reason that did not exist when the person punched. Key:
   `(providerType, idempotencyKey)`.
2. **Identify.** Unknown or inactive employee is refused, not guessed at.
3. **Sanity-check time.** Future timestamps beyond a small tolerance are
   refused. Manual retro-dating is bounded by `maxManualEntryDays` (policy).
4. **Assurance.** Start from the provider baseline, adjust where evidence
   justifies (GPS verified, device synced clock).
5. **Direction**, derived from prior canonical events for the work date
   (`directionForIncoming`; the ordering inside is load-bearing). The
   terminal's own in/out button is advisory only and a mismatch is flagged
   `DIRECTION_HINT_MISMATCH`.
6. **Dedup** (`resolveDuplicate`) inside the policy's window. The higher
   assurance event stays canonical; the other records a pointer and is flagged
   `CROSS_PROVIDER_DUPLICATE`. Nothing is deleted.
7. **Persist** event, evidence and audit entry **in one transaction**, so a
   punch cannot exist without its record of who caused it.
8. **Settle** the one employee-day synchronously (`settleDay`), so a manager
   sees the result at once.

Flags added on the way: `MOCK_LOCATION`, `DIRECTION_HINT_MISMATCH`,
`CROSS_PROVIDER_DUPLICATE`.

## Work date

"Which day does this punch belong to" is the hard question, not "which shift".
A 22:00 to 06:00 shift's clock-out at 01:00 Wednesday belongs to Tuesday's shift;
anchoring it to Wednesday splits one night into two days, each looking like a
missing punch. `resolveWorkDate` (`settle.ts`) and `schedule.ts` decide this in
the **branch's time zone**. Cover shifts and overnight shifts look at the local
date and the day either side.

## Schedule resolution (`schedule.ts`, pure)

For an employee and a work date, `resolveScheduleForDate` returns the shift that
applies, or null. Precedence, most specific first:

1. A **schedule exception** for that date. `DAY_OFF` wins outright.
   `SHIFT_CHANGE` and `EXTRA_SHIFT` (also used for cover shifts at another
   branch) name a shift. An exception naming a shift that no longer exists is bad
   data, not a day off, so it falls through.
2. A **rota pattern** assignment in effect (only when the branch has Auto rota
   on; see below). It **decides the day outright**: a day off in the cycle is a
   day off, never a fall-through to the recurring 8 to 5 underneath. That
   fall-through was the bug week-by-week rotas kept hitting.
3. A recurring **assignment** covering that ISO weekday; most recently effective
   wins when they overlap.
4. Nothing: attendance is still recorded, flagged `UNSCHEDULED`, and no lateness
   or overtime is computed because there is nothing to compare to.

With Auto rota **off**, patterns do not feed resolution; `generatePatternWeek`
writes a week into one-day exceptions so a manager can adjust the result.

**Public holidays** only affect recurring schedules (pattern and assignment), and
only for shifts marked `offOnPublicHolidays`. An exception is someone's
deliberate decision about that exact day, so it applies on a holiday like any
other; that is how people are rostered to work one. The holiday list is stored
(about fifteen rows a year) rather than computed, because Eid dates move with
the government's announcement. `loadScheduleInputs` (`settle.ts`) gathers branch
zone, assignments, exceptions, shifts, holidays and patterns in one parallel
read.

A punch anchors to a shift if it falls within `ANCHOR_BEFORE_START_MINUTES`
(4 hours) before the start or `ANCHOR_AFTER_END_MINUTES` (8 hours) after the end.
The window is asymmetric on purpose: leaving late is overtime and can run long.

## Policy (`policy.ts`, `policy-repository.ts`)

Effective-dated and **superseded, never updated**: saving a new version closes
the current one, so already-settled days keep resolving against the rules that
applied when they were worked. A branch row overrides the global row; a built-in
`FALLBACK_POLICY` applies when neither exists. Fields: grace in and out,
overtime threshold, break policy (`EXPLICIT_PUNCH` or `AUTO_DEDUCT`) and
parameters, rounding, auto-close grace, dedup window, max manual entry days,
`branchManagerCanAuthorizeOvertime`, and `isProvisional`. **Provisional** policy
values are placeholders pending the business's real answers (register **A1**,
red: blocks go-live). Saving with "confirmed" ticked removes the flag.

## Projection (`projection.ts`, pure)

Events, policy and schedule in; payroll figures out (`ProjectedDay`). All
**integer minutes**; no floats anywhere near wages. Outputs: scheduled, break,
gross, net worked, regular, overtime, late and early-departure minutes; actual in
and out; `lowestAssurance` (the weakest across the day, which should drive
review); status (`PENDING`, `SETTLED`, `NEEDS_REVIEW`); a **`policySnapshot`** of
the exact policy used, so a later policy change cannot retroactively change what
a day was settled under; and **flags**:

`UNSCHEDULED`, `MISSING_CLOCK_IN`, `MISSING_CLOCK_OUT`, `DUPLICATE_CLOCK_IN`,
`UNPAIRED_BREAK`, `MULTIPLE_SEGMENTS`, `MANUAL_ENTRY`, `AUTO_CLOSED`,
`LOW_IDENTITY_ASSURANCE`, `CORRECTED`, `OVERTIME_PENDING_APPROVAL`, `NO_EVENTS`.

`OVERTIME_PENDING_APPROVAL` is raised when calculated overtime exists and no payable overtime has been authorised (`settleDay` passes the stored `payableOvertimeMinutes` in, so recomputing never re-asks). It blocks `SETTLED`, so the day reaches the manager's review dialog, where approving sets payable overtime. Only payable overtime is meant to be paid; calculated overtime is what was worked.

Any flag that implies a human decision lands the day in the manager's
**Exceptions** queue (`?view=exceptions`).

## Settlement and sweeps

| What | Where | Trigger |
| --- | --- | --- |
| `settleDay` for one employee-day | `settle.ts` | every ingested event and correction |
| `runDailySettlementSweep` | `settle.ts` | worker periodic tick, cron |
| `autoCloseStaleDays` | `auto-close.ts` | worker periodic tick, cron. Inserts a deterministic-keyed `SYSTEM_AUTO_CLOSE` event (`autoclose:<employee>:<date>`) so re-running cannot double-close. |
| `dispatchUpcomingShiftReminders` | `reminders.ts` | worker periodic tick, cron. Shifts starting in 15 to 60 minutes, push, deduplicated via a recorded job. |

All three are exported from `jobs.ts`, the **only** attendance entry the worker
may import.

## Corrections and manual entry

- **Manual entry** (`manual.ts`): refuses self-entry, future timestamps, retro
  beyond the policy limit, and missing reason text. Reason codes:
  `DEVICE_OFFLINE`, `PHONE_UNAVAILABLE`, `NEW_EMPLOYEE_NOT_ENROLLED`,
  `FORGOT_TO_PUNCH`, `SYSTEM_OUTAGE`, `OTHER`. May require second approval.
- **Corrections** (`corrections.ts`, `correction-service.ts`): `ADJUST_TIME`,
  `INSERT_EVENT`, `VOID_EVENT`, `REASSIGN_BRANCH`. Each needs a reason code
  (`DEVICE_CLOCK_WRONG`, `WRONG_EMPLOYEE`, `DUPLICATE_PUNCH`, `FORGOT_TO_PUNCH`,
  `DISPUTE_RESOLVED`, `OTHER`) and free-text reason, refuses self-correction,
  and may require a second approver when it newly creates overtime
  (`canAuthorizeOvertime`). The before and after both remain visible.
- Both settle the day again and write audit in the same transaction.

## Leave (`leave.ts`)

Staff submit from the app (`app/api/v1/attendance/leave-requests`); reviewers
approve or reject in admin with notes. Ranges are inclusive, capped at 90 days
per request. Decisions push-notify the employee (`sendEmployeePushNotification`).

## Things that look wrong but are not

- A punch from the wrong branch is **refused** unless the employee holds a cover
  shift there. That is the rule, not a bug.
- Two punches within the dedup window yield one canonical event; the other is
  `SUPERSEDED` but still in the table.
- An open day credits zero until closed. Auto-close exists because "forgot to
  punch out" otherwise looks like "never worked".
- Direction is not what the terminal's button said.
- `AttendanceDay` rows change after the fact. That is by design; events do not.

## Verification

Anything here that depends on a transaction, constraint or trigger must be
verified against real Postgres on a scratch database; unit tests do not reach
it. See [testing-and-verification](./testing-and-verification.md#database-bound-work).
Pure rules have exhaustive tests named `attendance-*.test.ts`.
