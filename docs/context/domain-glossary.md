# Domain glossary

The words this codebase uses, what they mean here, and where each lives. Several
look interchangeable and are not (a *User* is not an *Employee*, a *Device* is
not a *device token*). Use these terms exactly in code, commits and docs.

Enum values are quoted from `prisma/schema.prisma`; read it for the full set.

## People and access

| Term | Meaning | Lives in |
| --- | --- | --- |
| **User** | Someone who signs in to the admin web. Has a password, MFA and role assignments. | `User`, `RoleAssignment`; `lib/modules/identity` |
| **AdminUser** | The legacy admin table. Retained read-only. Do not write to it. | `AdminUser` (register C3) |
| **Employee** | A staff member who can punch. May or may not also be a User. Linked by `actorEmployeeId` where self-action rules apply. | `Employee`; `lib/modules/employees` |
| **Role** | `EMPLOYEE`, `SHIFT_SUPERVISOR`, `BRANCH_MANAGER`, `AREA_MANAGER`, `HR`, `ADMINISTRATOR`, `SUPER_ADMIN`. Fixed system roles. | `Role` enum, `ROLE_PERMISSIONS` |
| **Custom role** | A named set of granular permissions an admin builds in the Roles screen. | `CustomRole`, `RolePermission` |
| **Scope** | Where a grant applies: `GLOBAL` or `BRANCH`. `REGION` does not exist yet (register B4). | `ScopeType` |
| **Actor** | The authenticated principal passed through authorization: user, assignments, optional custom role. | `Actor` in `authorization.ts` |
| **Permission** | A string. Two vocabularies coexist: legacy `resource:verb` (`attendance:write`) and granular `resource:action` (`attendance:approve`), bridged by `SYSTEM_TO_GRANULAR`. | `PERMISSION_REGISTRY`, `authorization.ts` |
| **Branch** | A store. Carries timezone, geofence (lat, lng, radius), hours. The unit of scoping. | `Branch` |

## Capture and attendance

| Term | Meaning | Lives in |
| --- | --- | --- |
| **Punch** | An employee's clock in or clock out, as the person sees it. | mobile and terminal routes |
| **AttendanceEvent** | The immutable record of one punch. Never edited or deleted (Postgres triggers). | `AttendanceEvent` |
| **Direction** | `IN`, `OUT`, `BREAK_START`, `BREAK_END`. **Derived by the server** from the day's existing punches, not trusted from the terminal's button. | `directionForIncoming` in `events.ts` |
| **Provider** | How an event was captured: `MOBILE_APP`, `FINGERPRINT`, `MANAGER_MANUAL`, `SYSTEM_AUTO_CLOSE`. Capabilities are declared once in `providers.ts`. | `ProviderType`, `providers.ts` |
| **Assurance** | How far an event can be trusted, on **three independent axes**: identity (`NONE`, `ASSERTED`, `DEVICE_BOUND`, `BIOMETRIC`), location (`NONE`, `ASSERTED`, `GPS_VERIFIED`, `PHYSICALLY_PRESENT`), time (`SERVER`, `DEVICE_SYNCED`, `DEVICE_UNVERIFIED`, `HUMAN_ASSERTED`). | `assurance.ts` |
| **Canonical / superseded / voided** | An event's derived status. Canonical counts. Superseded lost a duplicate contest. Voided was removed by a correction. Status is *derived*, because rows are immutable. | `deriveStatus` in `events.ts` |
| **Dedup window** | Two events within the policy's `dedupWindowMinutes` (default 5) describe one action; the higher-assurance one stays canonical. | `resolveDuplicate`, `AttendancePolicy` |
| **Geofence decision** | `INSIDE`, `OUTSIDE`, `AMBIGUOUS`, `NOT_APPLICABLE`. Computed server-side from coordinates plus accuracy. | `geofence.ts` |
| **Clock skew** | Difference between a terminal's clock and the server's, recorded on device events. | `clockSkewMs` |
| **Quarantine** | A terminal punch that cannot be attributed (unknown serial or unmapped PIN) held aside, not dropped. Alerts Slack. | `QuarantinedEvent` |
| **Idempotency key** | Client-supplied key making a mobile punch safe to retry or sync offline. | `mobile.ts`, `punch/sync` |
| **Device** | A registered fingerprint **terminal**. | `Device`, `DeviceLog` |
| **EmployeeDeviceIdentity** | Binds an employee to a capture identity: a terminal PIN, or a mobile app install. Also carries the push token in its label JSON. | `EmployeeDeviceIdentity`, `parseDeviceMetadata` in `push.ts` |
| **deviceToken** | The bearer token the mobile app uses after OTP login. Not the same as a `Device`. | `mobile-auth.ts`, `app/api/v1` |
| **Review demo account** | A fixed account for app-store reviewers who cannot receive an SMS. Scoped to one phone number. | `review-demo.ts`, register A7 |

## Days and pay

| Term | Meaning | Lives in |
| --- | --- | --- |
| **Work date** | The calendar day a punch *belongs to*, in the branch's zone. A 01:00 clock-out after a night shift belongs to the previous day. | `schedule.ts`, `resolveWorkDate` |
| **Projection** | The pure function from events, policy and schedule to a day's figures. | `projection.ts` |
| **AttendanceDay** | The stored projection. Never hand-edited; recomputed. Carries `PROJECTION_VERSION` so old days can be found and replayed. | `AttendanceDay`, `settle.ts` |
| **Day status** | `PENDING`, `SETTLED`, `NEEDS_REVIEW`. | `DayStatus` |
| **Day flag** | A reason a day needs eyes: `MISSING_CLOCK_OUT`, `UNSCHEDULED`, `LOW_IDENTITY_ASSURANCE`, `AUTO_CLOSED`, `CORRECTED`, and others. | `DayFlag` in `projection.ts` |
| **Exception** | A flagged day on the manager's Exceptions queue. (Not the same as a *schedule exception*.) | `exceptions-table.tsx` |
| **Settlement** | Writing the projected day. Triggered per punch and by a daily sweep. | `settle.ts`, `runDailySettlementSweep` |
| **Auto-close** | A real `SYSTEM_AUTO_CLOSE` event inserted when nobody clocked out, giving scheduled hours and flagging the day. | `auto-close.ts` |
| **Correction** | A manager's fix: `ADJUST_TIME`, `INSERT_EVENT`, `VOID_EVENT`, `REASSIGN_BRANCH`. Voids and inserts, never edits. Needs a reason code, sometimes a second approver. | `AttendanceCorrection`, `corrections.ts` |
| **Manual entry** | A manager typing a punch in. The least-verified path, so it has guard rails (no self-entry, retro limit, reason). | `manual.ts` |
| **Policy** | Effective-dated rules: grace, overtime threshold, break handling, rounding, auto-close grace, dedup window. Global or per branch. May be **provisional**. | `AttendancePolicy`, `policy.ts` |
| **Overtime authority** | Who may authorise payable overtime: admins always, area managers for their branches, branch managers only if the policy allows. | `overtime-auth.ts` |

## Scheduling

| Term | Meaning | Lives in |
| --- | --- | --- |
| **Shift** | A named template: start and end minute, unpaid break, optional `offOnPublicHolidays`. Branch-specific or global. | `Shift` |
| **Assignment** | An employee on a shift on given weekdays between two dates (`EmployeeShiftAssignment`). | `schedule.ts` |
| **Rota pattern** | A repeating cycle of shifts and days off (`ShiftPattern`, `ShiftPatternDay`) assigned from an anchor date (`EmployeePatternAssignment`). | `patterns.ts` |
| **Auto rota** | A per-branch switch. On: patterns feed schedule resolution directly. Off: a week is *generated* into one-day overrides for the manager to adjust. Off everywhere by default. | `patterns.ts`, register D5 |
| **Schedule exception** | A one-day override: `DAY_OFF`, `SHIFT_CHANGE`, `EXTRA_SHIFT`. | `ScheduleException` |
| **Cover shift** | An `EXTRA_SHIFT` at a branch the person is not assigned to. The only way a punch is accepted at a foreign branch. | `cover.ts` |
| **Public holiday** | Stored dates (about fifteen a year), pre-filled from the bundled Ghana calendar. Eid dates move and need confirming. | `PublicHoliday`, `holidays.ts`, register D4 |
| **Leave request** | Staff-submitted from the app, reviewed in admin. Types and statuses in `LeaveType`, `LeaveStatus`. | `leave.ts` |

## Other domains

| Term | Meaning | Lives in |
| --- | --- | --- |
| **Feedback** | A customer's anonymous rating submission via a branch QR code. | `lib/modules/feedback` |
| **Assessment** | An *internal* evaluation of staff. Own models (register B10). | `lib/modules/assessments` |
| **Aptitude test** | A *candidate* screening test. No `Candidate` table (register B11). Tokenised invitations or a public link. | `lib/modules/aptitude` |
| **Invitation** | A single-use token to take an assessment or aptitude test, delivered by queued email. | `*Invitation` models |

## System terms

| Term | Meaning | Lives in |
| --- | --- | --- |
| **Job** | A durable unit of background work in Postgres. States and retries in `JobStatus`. `DEAD` after 5 attempts, with a Slack alert. | `Job`, `lib/platform/jobs.ts` |
| **Worker** | The separate process that drains jobs and runs sweeps. | `worker/` |
| **Sweep** | A time-driven batch (settlement, auto-close, shift reminders, auto-submit of expired tests, purges). Runs from the worker, and from cron where there is no worker. | `*/jobs.ts` |
| **Audit log** | Append-only record of mutations, with the actor denormalised so it outlives the user. | `AuditLog`, `recordAudit` |
| **Append-only** | Enforced by Postgres triggers: `attendance_events`, `attendance_corrections` (content immutable, no delete), `audit_logs`. UPDATE and DELETE are refused. | migrations |
| **Register** | `docs/architecture/open-decisions.md`. Provisional values, deferrals, gaps. | docs |
| **Gates** | `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. | [testing](./testing-and-verification.md) |
