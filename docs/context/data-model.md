# Data model

The schema is `prisma/schema.prisma`. It is long and heavily commented, and the
comments are the authority on *why* a column exists. This page is the map: how
the models group, which ones are special, and the constraints that are easy to
miss. For vocabulary, see [domain-glossary](./domain-glossary.md).

Database: PostgreSQL 16. ORM: Prisma 6. IDs are `cuid` strings. Dates that mean
"a calendar day" (`DATE` columns) hold that day at UTC midnight with no zone
conversion (`new Date("2026-10-01T00:00:00.000Z")`); instants are `timestamptz`.

## Groups

| Group | Models |
| --- | --- |
| **Identity and access** | `User`, `PasswordResetToken`, `MfaRecoveryCode`, `RoleAssignment`, `CustomRole`, `PermissionRecord`, `RolePermission`, `Session`, legacy `AdminUser` |
| **Organisation** | `Branch`, `Employee`, `EmployeeBranchAssignment`, `EmploymentStatus` (`ACTIVE`, `SUSPENDED`, `TERMINATED`) |
| **Schedule** | `Shift`, `EmployeeShiftAssignment`, `ShiftPattern`, `ShiftPatternDay`, `EmployeePatternAssignment`, `ScheduleException`, `PublicHoliday`, `LeaveRequest` |
| **Capture** | `AttendanceEvent`, `EventEvidence`, `QuarantinedEvent`, `Device`, `DeviceLog`, `EmployeeDeviceIdentity` |
| **Derived and corrective** | `AttendanceDay`, `AttendanceCorrection`, `AttendancePolicy` |
| **Platform** | `Job`, `EmailDelivery`, `AuditLog`, `RateLimitCounter` |
| **Announcements** | `Announcement`, `AnnouncementRecipient`, `Notification` (the staff inbox) |
| **Feedback** | `Question`, `FeedbackSubmission`, `FeedbackAnswer`, `BranchFeedbackRecipient` |
| **Assessments** | `Assessment`, `AssessmentSection`, `AssessmentQuestion`, `AssessmentOption`, `AssessmentInvitation`, `AssessmentResponse`, `AssessmentAnswer` |
| **Aptitude** | `AptitudeTest`, `AptitudeSection`, `AptitudeQuestion`, `AptitudeOption`, `AptitudeInvitation`, `AptitudeAttempt`, `AptitudeAnswer` |

## The three layers of attendance data

This is the part to understand before touching anything pay-related.

```
  AttendanceEvent  (immutable facts)        what the terminal or phone said
        +  AttendanceCorrection (immutable)    what a manager decided, and why
        +  AttendancePolicy (effective-dated)  the rules in force that day
        +  Shift / ScheduleException / ...     the schedule that applied
        |
        v   pure projection (projection.ts)
  AttendanceDay    (derived, rewritable)     the figures payroll reads
```

- Facts are never edited. A correction **voids and inserts**. "The device said
  08:47, the manager set 08:02 because the clock had drifted" stays answerable.
- `AttendanceDay` is deliberately the opposite: *rewritable*, because it is
  recomputable. Fix a calculation bug by replaying, not by patching rows.
- An event has no `status` column. Supersession is recorded as pointers set at
  INSERT (`supersedesEventId`, `supersededByEventId`), and voiding comes from
  corrections. Whether an event counts is derived (`deriveStatus` in
  `lib/modules/attendance/events.ts`). See the long comment on the model.

## Immutability, enforced in Postgres

| Table | Rule | Defined in |
| --- | --- | --- |
| `attendance_events` | UPDATE and DELETE refused by trigger | `20260906110000_add_attendance_events` |
| `attendance_corrections` | DELETE refused; content immutable | `20260906140000_add_attendance_corrections` |
| `audit_logs` | UPDATE and DELETE refused | `20260905140000_add_audit_log` |

Consequences you will hit:

- **You cannot clean up after a test on these tables.** Verify database-bound
  work on a scratch database ([testing-and-verification](./testing-and-verification.md)).
- A migration that needs to alter them must handle the trigger explicitly.
- Never weaken a trigger to "append-only except sometimes".

## Constraints that live elsewhere than the database

Some invariants are enforced in the service layer, not by a constraint. They are
recorded in the register so they are not mistaken for guarantees.

| Invariant | Enforced by | Register |
| --- | --- | --- |
| One primary branch per employee | service layer | B7 |
| One active device identity per employee and provider | service layer | B9 |
| Branch-scoped attendance policy | resolved in `policy-repository.ts` | B5 |
| `ScopeType.REGION` | does not exist; area managers hold one BRANCH assignment per branch | B4 |

## Soft deletion and retention

- Assessments are soft-deleted (`add_assessment_soft_delete`).
- Employees are `TERMINATED`, not deleted; attendance records are kept
  indefinitely (see the privacy decisions in the register, A6).
- Sent invitation jobs, expired password resets and old email deliveries are
  purged by sweeps in the worker.

## Migrations

- One chain, on `develop`. `main` only receives fast-forward merges from
  `develop`, so there is never a second chain.
- File names are `YYYYMMDDHHMMSS_snake_case`. Look at the latest few in
  `prisma/migrations/` for house style.
- **Production migrations are run by the user** with
  `pnpm db:migrate:deploy:prod`. The only safe production command is
  `prisma migrate deploy`. `migrate dev` can reset a database and `db push`
  bypasses history. Migrating and deploying are separate acts, migrate first.
- A migration that ships with code which needs it is a coordination problem:
  note it in [HANDOVER](../HANDOVER.md) and the register (see D4 and D5 for the
  pattern: "built, not yet migrated in production", plus the production steps).
- Recipe: [workflows: add a migration](./workflows.md#add-a-migration).

## Seeds and scripts

| Script | Purpose |
| --- | --- |
| `pnpm db:seed` (`prisma/seed.ts`) | Admin account, questions, sample branches |
| `db:seed:dev`, `db:seed:feedback`, `db:seed:data-analyst`, `db:seed:aptitude-test` | Development fixtures |
| `db:seed:review-demo` | App-store review account (needs `--conditions=react-server`, already in the script) |
| `prisma/pilot-*.ts` | One-off operational scripts. They refuse a non-local database unless `PILOT_ALLOW_REMOTE=1`. |

For new operational scripts, a pattern worth following: dry run first, explicit
`--apply`, idempotent, header comment saying what it does and how to re-run.
