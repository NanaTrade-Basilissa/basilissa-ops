# Spec: Announcements

- **Status:** **Phases 1, 2 and 4 are built** (schema, permissions, audience rules, compose, history, the staff inbox and its mobile API, push through a fan-out job, the urgent banner and acknowledgement). Only phase 3 (email, SMS) is not built; its columns are already in the schema. See [Build status](#build-status).
- **Open questions:** the ones at the end are still open; Phase 1 and 2 used the defaults recorded under Build status.
- **Owner:** to be assigned
- **Register entry:** D6 in [open-decisions](../architecture/open-decisions.md)
- **Touches:** a new `announcements` module, `lib/platform/push.ts`, `sms.ts`,
  `email.ts`, the worker, the mobile API (`/api/v1`), and the mobile app (separate
  repository)

## Problem

Push notifications exist, but only as side effects of system events (leave
decisions, shift reminders). Nobody can send staff a message from the dashboard.
Pushes are also fire-and-forget: if a phone is off, the notification is dismissed,
or the app is reinstalled, the message is gone, and there is nowhere to read it
again or to know who has seen it.

## Goals

1. An admin or manager composes a message in the dashboard and sends it to the
   right staff: everyone, one or more branches, or chosen people.
2. Staff receive it on whichever channels the sender picked (push, SMS, email),
   **and always** in an in-app inbox, so it can be found later.
3. One **urgent** announcement at a time can pin a banner in the app.
4. A sender can require **acknowledgement** ("I've read this") and see who has not
   given it.
5. The dashboard shows per-recipient delivery, read and acknowledgement status.

## Non-goals

- Replies or two-way chat. Announcements are read-only.
- Rich content, attachments, or scheduling (all reasonable later; see Open
  questions).
- Replacing system notifications. They gain an inbox entry but keep their own
  triggers.
- Customer-facing messaging. Staff only.

## Decisions already made

| Decision | Choice |
| --- | --- |
| Dashboard name | **Announcements** (the section may later sit under a parent called Communications) |
| Audience | Everyone, Branch(es), or Specific people, as one picker with modes |
| Channels | Push, SMS, Email as checkboxes. In-app inbox is always on and is not a checkbox |
| Mobile | A Notifications screen with two tabs: **All** and **Announcements**. Unread badge on its entry point |
| Urgent | A flag on an announcement, not a separate type. **At most one active at a time** |
| Urgent after expiry | Still an announcement, still in history and the Announcements tab. Only the banner expires |
| Acknowledgement | Optional per announcement, explicit tap, distinct from "read" |

## Design

### Data

```
Announcement
  id, title, body
  isUrgent          boolean   stays true forever; it records what was sent
  bannerExpiresAt   timestamptz?  when the banner stops showing
  bannerClearedAt   timestamptz?  set when the banner stops (expiry sweep, manual
  bannerClearedBy   user?           clear, or replaced by a newer urgent)
  bannerClearReason enum?         EXPIRED | MANUAL | SUPERSEDED
  requiresAck       boolean
  audienceKind      ALL | BRANCHES | PEOPLE
  audienceSpec      json      the branch ids or employee ids chosen
  channels          json      { push, sms, email } as sent
  createdBy, createdAt

AnnouncementRecipient          one row per employee, resolved at send time
  announcementId, employeeId   unique together
  pushStatus, smsStatus, emailStatus   NOT_REQUESTED | PENDING | SENT | FAILED | UNREACHABLE
  pushError, smsError, emailError, *SentAt
  acknowledgedAt               immutable once set

Notification                   the inbox, for every kind of notice
  id, employeeId, kind (ANNOUNCEMENT | LEAVE_DECISION | SHIFT_REMINDER ...)
  title, body, data json, announcementId?
  readAt, createdAt
```

The inbox is **one table for all kinds** so the **All** tab is a single query.
Existing system notifications (leave decisions, shift reminders) start writing an
inbox row in the same transaction as the event. Read state lives on
`Notification`; acknowledgement and per-channel delivery live on
`AnnouncementRecipient`. (A single table with a nullable `announcementId` is one
option; two tables is another. Review before building.)

### Resolve the audience once, and store it

At send time, the audience is resolved to a **fixed recipient list** and written as
`AnnouncementRecipient` rows. Do not store only the filter: "who was this sent to?"
must not change when people move branches. Resolution is a **pure function**
(inputs: the audience spec and employee data) so it can be tested exhaustively.
Only `ACTIVE` employees are recipients.

### The one-urgent rule

Enforce it in Postgres, not only in the action, so a direct POST or two admins
sending at once cannot break it:

```sql
CREATE UNIQUE INDEX announcements_one_active_urgent
  ON announcements ((true))
  WHERE is_urgent AND banner_cleared_at IS NULL;
```

A partial index cannot refer to `now()`, so **expiry is a state change, not a
comparison**: the banner is active while `banner_cleared_at IS NULL`. Reads also
treat `banner_expires_at < now()` as inactive, so a late sweep never shows a stale
banner. Publishing a new urgent runs in one transaction that first clears any
active urgent (reason `SUPERSEDED`, and any already expired one as `EXPIRED`), then
inserts the new one. The compose screen asks "this replaces the current urgent
announcement" before sending. A worker sweep sets `banner_cleared_at` on expired
banners.

(This replaces an earlier idea of a unique index with an expiry predicate, which
Postgres cannot express.)

### Acknowledgement

- Per announcement (`requiresAck`). The app shows an **I've read this** button;
  tapping sets `acknowledgedAt` once. It is never cleared or edited.
- Read is not acknowledgement. Read means opened; acknowledgement is a deliberate
  act and is the one that may matter in a dispute, so treat the row as evidence:
  server-side timestamp only, no client-supplied time.
- Natural pairing: urgent plus `requiresAck`. The banner can stay until the person
  acknowledges, even after `bannerExpiresAt` for them only (decide in review).
- Dashboard: "42 of 50 acknowledged" with the list of who has not. A **remind**
  action re-sends to unacknowledged recipients only.

### Sending

1. The action checks permission, validates, resolves the audience, and in **one
   transaction** inserts the announcement, the recipients, the inbox rows, and an
   `ANNOUNCEMENT_FANOUT` job (`enqueue(..., tx)`), plus the audit entry.
2. The worker handler fans out in chunks per channel. It only sends where a
   recipient's status is `PENDING`, so a retry or a second worker never double
   sends. Each send carries an idempotency key
   (`announcement:<id>:<employee>:<channel>`).
3. Per-recipient, per-channel status and error are written back, so failures are
   visible and retryable from the dashboard.
4. Recipients with no usable address for a channel are marked `UNREACHABLE`, not
   failed.

**Before sending**, the compose screen shows a preview: recipients, and per
channel how many are reachable ("42 push, 38 SMS, 40 email, 3 with no phone").
SMS is **off by default** and shows an estimated cost. Add a per-send SMS ceiling.

### Channels

| Channel | Mechanism | Notes |
| --- | --- | --- |
| In-app | `Notification` row | Always. Source of truth for the other channels |
| Push | `sendEmployeePushNotification` | Payload carries the notification id; title short; no sensitive body |
| SMS | `sendSms` (`lib/platform/sms.ts`) | Costs money; opt-in per send; Ghana number normalisation |
| Email | `sendEmail` through the email queue | Needs an address on the employee record |

Push tokens are not pruned today (register note under push). A broadcast makes
that matter, so clear tokens the provider reports as no longer registered as part of this work.

### Permissions

A new `announcements` resource in `PERMISSION_REGISTRY`:

- `create` to send, `read` for history and delivery status, and
  `update`/`delete` only if retraction is allowed (not in v1).
- **Audience follows scope.** `Everyone` needs a **global** grant. A branch
  manager may target only branches covered by their own grants
  (`requireBranchPermission`, `branchScope`). Naming no branch must never widen
  access. People mode is limited to employees at branches in scope.
- Sending an urgent announcement may deserve its own permission. Decide in review.
- Every Server Action re-checks, since it is reachable by direct POST.

### Mobile API (`/api/v1`)

All Bearer `deviceToken`, employee taken from the token, documented in
`openapi-spec.ts`.

| Endpoint | Purpose |
| --- | --- |
| `GET /notifications?kind=&cursor=` | The inbox, newest first, paginated. `kind=announcement` for the second tab |
| `GET /notifications/unread-count` | The badge |
| `POST /notifications/{id}/read` | Mark read (idempotent) |
| `GET /announcements/urgent` | The active banner, or none |
| `POST /announcements/{id}/ack` | Acknowledge (idempotent, only the recipient) |

The mobile app is a separate repository; agree this contract with whoever builds
it before starting. Prefer additive changes.

### Dashboard

`app/admin/(dashboard)/announcements/`: a compose screen (audience picker, channel
checkboxes, urgent and acknowledgement toggles, preview and confirm), a history
list, and a detail page with per-recipient status, read and acknowledgement. Build
with shadcn components (dialog, tabs, table, combobox for people, badge variants
for status).

## Tests and verification

- **Pure:** audience resolution (all modes, inactive staff, branch scope).
- **Authorization:** global vs branch-scoped sender; manager cannot target another
  branch; direct POST without permission refused.
- **Postgres (scratch database):** the one-urgent unique index refuses a second
  active urgent; supersede transaction leaves exactly one; expiry sweep clears;
  acknowledgement row cannot be changed.
- **Fan-out:** idempotent on retry; per-channel failure does not block the others;
  unreachable is not failed.
- **Mobile API:** only the recipient can read or acknowledge; pagination; idempotent
  read.
- **Authenticated session** for every admin check.

## Build order

See [Build status](#build-status) for what has shipped.

1. **Phase 1:** schema, `announcements:*` permissions, audience resolution, compose
   with in-app only, history, mobile list, read and unread-count endpoints.
   System notifications start writing inbox rows. Needs the mobile screen.
2. **Phase 2:** push channel, fan-out job, delivery status, token pruning.
3. **Phase 3:** email and SMS channels, preview counts, SMS cost guard.
4. **Phase 4:** urgent banner with the unique index and expiry sweep; acknowledgement,
   stats and remind.

Each phase ships on its own, and migrations are additive.

## Build status

| Phase | Status |
| --- | --- |
| 1. Schema, permissions, audience resolution, compose (in-app), history, mobile inbox endpoints, system notices write inbox rows | **Built** |
| 2. Push channel, fan-out job, per-recipient delivery status | **Built** |
| 3. Email and SMS channels, per-channel reachability counts, SMS cost guard | Not built |
| 4. Urgent banner, acknowledgement, stats | **Built** (the "remind unacknowledged" action is not) |
| Mobile app: Notifications screen (All and Announcements tabs, badge), urgent banner, "I've read this" | **Built** (`feat/notifications-inbox` in the app repo; needs a native build to test) |

**What differs from the design above, and why**

- **One migration for all four phases.** `20261001200000_add_announcements` creates every column and the one-urgent partial unique index now, because production migrations are run by hand and one step beats four. Phases 3 and 4 add code, not schema.
- **Defaults chosen for open question 1** (who may send): `announcement:write` and `announcement:read` are held by `BRANCH_MANAGER`, `AREA_MANAGER`, `HR`, `ADMINISTRATOR` and `SUPER_ADMIN`. Branch and area managers are branch-scoped, so they can address only their own branches and never Everyone. Change it in `ROLE_PERMISSIONS` (`authorization.ts`). No separate permission for urgent yet.
- **Visibility:** someone with a company-wide grant sees every announcement; a branch-scoped sender sees only what they sent themselves.
- **The inbox is `lib/platform/inbox.ts`**, not part of the announcements module, so leave decisions and shift reminders (which now also write inbox rows) use it without importing a domain module. Those rows are best effort: a failed write is logged and never undoes the decision it describes.
- **Mobile endpoints** are `GET /api/v1/notifications`, `GET /api/v1/notifications/unread-count`, `POST /api/v1/notifications/{id}/read` and `POST /api/v1/notifications/read-all`, all in `openapi-spec.ts`. `GET /announcements/urgent` and `POST /announcements/{id}/ack` arrive with Phase 4.
- **Fan-out** is the `announcements.fanout` job. It handles only recipients still `PENDING`, so a retry resumes; a deleted announcement dies at once. Failed recipients stay `FAILED`; there is no retry button yet.
- **Push payload** carries `{ type: "ANNOUNCEMENT", announcementId }` and a 140 character preview.
- **Token pruning is still not done.** A dead push token shows as a failed recipient and stays registered.
- **The audience preview** shows how many recipients have the app (an active mobile binding), not how many have a registered push token.

**Phase 4 decisions**

- **Urgent is company-wide senders only** (`scope.kind === "all"`). The banner is shown to everyone and there is one, so a branch manager's urgent message would otherwise silently replace an administrator's. Branch managers can still send ordinary announcements and ask for acknowledgement.
- **Sending a new urgent replaces the current one** in the same transaction: an expired banner the sweep has not reached is cleared as `EXPIRED`, a live one as `SUPERSEDED`. Two administrators sending at the same instant hit the partial unique index; one wins and the other is told to check and resend (`URGENT_CONFLICT`).
- **Banner length is a choice** (4, 12 or 24 hours, or 3 days), never a free number.
- **Acknowledgement** is set once with the server's clock, in the same transaction as its audit entry, and never changes. It also marks the inbox row read.
- **Endpoints:** `GET /api/v1/announcements/urgent` and `POST /api/v1/announcements/{id}/ack`. Inbox items for announcements carry `urgent`, `ackRequired` and `acknowledged`.
- **Expiry:** reads treat a past `bannerExpiresAt` as inactive, and the worker's periodic sweep (`expireUrgentBanners`) records it. A late sweep never shows a stale banner.
- **Not done:** open question 9 (keeping the banner for someone who has not acknowledged after it expired for everyone else), and the "remind unacknowledged" action.

**Verified** on a scratch Postgres database: the whole send is one transaction (a failing audit write rolls back the announcement, recipients, inbox rows and job); the second active urgent announcement is refused by the index; inbox rows are idempotent; the fan-out is safe to re-run; scope refusals write nothing. Verified in the browser with real sessions: the compose flow, the live count, the confirmation and the detail page; a branch manager sees only their branch, has no Everyone option and gets a 404 for an announcement they did not send. The mobile endpoints were exercised with a real device token.

## Open questions

These change the build; answer before Phase 1.

1. **Who may send, and who may send urgent?** Only HR and administrators, or branch
   managers for their own branch too?
2. **Staff without the app** get no inbox. Is SMS or email alone acceptable for
   them, or must everyone have the app?
3. **SMS budget:** what per-send ceiling and who approves cost?
4. **Acknowledgement:** is there a deadline, and does a missing acknowledgement
   escalate to a manager?
5. **Retention:** how long do announcements and inbox rows live? (Acknowledgements
   may be needed as evidence.)
6. **Content limits:** maximum length, links allowed, languages?
7. **Scheduled send** (for example "tomorrow 07:00 Accra time"): v1 or later?
8. **Mobile release:** can the app team deliver the Notifications screen alongside
   Phase 1, or does the API ship first?
9. Should an urgent banner remain for a person until they acknowledge, even after
   it has expired for everyone else?
