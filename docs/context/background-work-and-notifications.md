# Background work and notifications

Everything that happens outside a request, and every message the system sends
to a person.

## Three ways work runs

| Mechanism | For | Retries and history | Where |
| --- | --- | --- | --- |
| **Job queue** | Work caused by an event: send this email, notify HR | Yes. Backoff, `DEAD` after 5 attempts, Slack alert, visible in the Jobs screen | `lib/platform/jobs.ts`, `worker/` |
| **Periodic sweeps** | Work caused by the clock: auto-close, settlement, reminders, purges | No. A failed sweep logs and runs again next interval | `worker/index.ts` `runPeriodic` |
| **Cron route** | The same sweeps for a platform with cron and no worker | None | `app/api/cron/attendance`, `vercel.json` |

The queue is **Postgres**, not a broker (ADR 0002). That is a correctness
feature: `enqueue(type, payload, options, tx)` accepts a transaction client, so a
job is created in the same transaction as the change that causes it. Work is
never scheduled for a change that rolled back, and never lost for one that
committed. An external broker cannot give that guarantee.

## The job queue

`lib/platform/jobs.ts` owns the mechanism: `enqueue`, `claim` (`FOR UPDATE SKIP
LOCKED`), `markSucceeded`, `markFailed` (exponential, jittered backoff),
`reclaimStuck` (a `RUNNING` job whose lock is older than `WORKER_STALE_JOB_MS`
means its worker died), `queueDepth`. Statuses: `PENDING`, `RUNNING`,
`SUCCEEDED`, `DEAD`.

`worker/registry.ts` owns the vocabulary: a map from job type to handler. It
lives there rather than in `platform` because it imports domain modules and
platform must never depend on a module.

Current job types: `FEEDBACK_NOTIFY`, `PASSWORD_RESET_SEND`,
`ASSESSMENT_INVITATION_SEND`, `ASSESSMENT_NOTIFY_HR`,
`APTITUDE_INVITATION_SEND`, `APTITUDE_NOTIFY_HR`, `ANNOUNCEMENT_FANOUT`. A queued job with no handler is
treated as a failure and retried, then dies. That is right for a job enqueued by
a newer deploy than the running worker.

### Rules for a job handler

1. **Idempotent.** It may run twice (a stale-lock reclaim, a retry after a
   timeout that actually delivered). For email, pass an `idempotencyKey`
   (`emailOptionsForJob`).
2. **Import path:** the worker imports only `@/lib/modules/*/jobs`, never
   `*/server`. The server barrels reach `next/navigation` and React's client
   context, which kills a plain Node process at startup. This has happened once.
3. **Payloads carry ids, not secrets** where avoidable. Where a payload carries
   a token (password reset, invitations), a purge sweep deletes the sent job.
4. **A failure should throw** so the queue retries. `sendEmail` reports instead
   of throwing; the handler decides what the result is worth (register E1, E5).
5. Enqueue **inside the transaction** of the change that causes it.

### Adding one

See [workflows: add a background job](./workflows.md#add-a-background-job).

## The worker process (`worker/index.ts`)

A separate long-running process from the same image
(`PROCESS_ROLE=worker`, `docker/start.sh`). Run locally with `pnpm worker`
(`tsx --conditions=react-server`; without that flag `server-only` throws at the
first import).

Each **tick** (`WORKER_POLL_INTERVAL_MS`, default 60 s): run periodic work if its
interval has elapsed, reclaim stuck jobs, claim a batch (`WORKER_BATCH_SIZE`,
default 5), run them **sequentially**, then log queue depth and warn on dead
jobs or backlog older than `WORKER_BACKLOG_WARN_MS`.

**Periodic work** (every `WORKER_PERIODIC_INTERVAL_MS`, default 15 min), each in
its own `try` so one failure cannot skip another: attendance auto-close, shift
reminders, daily settlement, expired password reset purge, sent invitation job
purges (assessments and aptitude), aptitude auto-submit of expired attempts, old
email delivery purge (7 days).

The poll interval is a **cost** parameter as well as a latency one: Neon
autosuspends idle compute and a polling worker keeps it awake (ADR 0001, register
E3). Use the longest interval the requirement allows. Nothing queued today is
urgent.

Liveness: there is no signal beyond logs and the queue-depth lines (register
E4). The worker runs on Railway with a redundant copy on Cloud Run; both drain
the same queue safely because claiming uses `SKIP LOCKED`.

## Channels

| Channel | Code | Provider | Reaches |
| --- | --- | --- | --- |
| **Email** | `lib/platform/email.ts`, templates in `lib/email-templates/` | HTTP gateway at `EMAIL_SERVER_URL` (Nodemailer service) | Anyone with an address |
| **SMS** | `lib/platform/sms.ts` | Nana Trade Server gateway: `/notify/otp` for login codes, `/sms/charge` for announcements | Anyone with a phone number: login OTPs and announcements |
| **Push** | `lib/platform/push.ts` | FCM via `firebase-admin`, and Expo tokens | Employees with the mobile app installed and a registered token |
| **Slack** | `lib/platform/slack.ts` | Incoming webhook | The ops team, not staff |

### Email

- `sendEmail` **never throws**; it returns `sent`, `skipped`
  (`not_configured`, `no_recipients`) or `failed` (`retryable` or not, with
  `failedRecipients`). The caller decides what failure means.
- Every send is recorded in `EmailDelivery`. With an `idempotencyKey`, recipients
  who already received it are skipped, each copy gets a stable Message-ID, and
  retries can ask the gateway to check the Sent folder first
  (`skipIfAlreadySent`, about 3 s, retries only).
- Dynamic sender name: the branch name for feedback, `Basilissa HR` for
  candidate invites, `Basilissa Admin` for staff invites and resets.
- The admin **Email queue** screen shows jobs, deliveries and failures.
- **Careful:** with no `EMAIL_SERVER_URL`, `env.ts` falls back to the production
  Nodemailer gateway, so an unconfigured environment really sends. When verifying
  email-sending code against a scratch database, point `EMAIL_SERVER_URL` at a dead
  local port (`http://127.0.0.1:9/email`) so nothing can leave the machine.

### SMS

- `normalizePhoneNumber` canonicalises to `+233...`. `formatGhanaTel` formats for
  the gateway. `dispatchOtpViaGateway` sends an OTP and reports to Slack on
  failure (`notifyOtpFailure`).
- **Cost per message is real.** Anything that fans out SMS needs an explicit
  opt-in and a count shown first.
- `sendSms({ recipient, message, name?, subject?, sender? })` posts one recipient to
  `/sms/charge` as `{ recipients: [{ recipient_number, name, message, subject, from }] }`
  (endpoint `SMS_CHARGE_URL`, default the production gateway; same optional Bearer
  token as the OTP). It returns `SendSmsResult` (`ok`, `simulated`, `messageId`,
  `error`) and treats a bad status or a `success: false` body as a rejection. OTP
  login uses `dispatchOtpViaGateway`. Anything that sends SMS to staff should use
  `sendSms`, not a second gateway client.
- **Confirmed against the live gateway:** HTTP 200 `{ "success": true, "message":
  "Messages sent successfully" }`, no auth needed. No message id and no
  per-recipient detail, so `SENT` means the gateway accepted it, not that the phone
  received it, and a failure inside a 200 reply cannot be told apart.
- **It really sends and costs money.** There is no "unconfigured means simulated"
  for SMS, as there is none for the OTP. Set `SIMULATE_SMS=true` to log instead.
  Tests simulate under `NODE_ENV=test`.

### Push

- `sendPushNotification(tokens, payload)` routes each token: Expo tokens
  (`ExponentPushToken[...]`) to Expo, everything else to FCM. Returns a
  `PushReceipt` per token (`ok`, `id`, `error`, `simulated`).
- `sendEmployeePushNotification(employeeId, payload)` finds the employee's
  active `MOBILE_APP` `EmployeeDeviceIdentity` rows (`revokedAt` null), reads the
  push token out of each row's JSON `label` (`parseDeviceMetadata`), and sends.
- Tokens are registered by the app at `POST /api/v1/notifications/push-token`.
- **Sign-out** calls `DELETE /api/v1/notifications/push-token`, which removes only the
  token. The device binding is untouched: signing out is not releasing the phone.
- **The label holds the token.** After registration an identity's `label` is JSON
  (`deviceName`, `pushToken`, `platform`, `registeredAt`). Never display, send to
  the browser or audit the raw label; use `deviceNameFromLabel` (`push.ts`), as
  `getEmployee` and the device-release audit entry do. The registration route
  keeps the device name already on record, because the app always sends a generic
  one.
- **Simulated** (logged, not sent) under `NODE_ENV=test`, `EXPO_PUSH_DISABLED=true`
  or `PUSH_NOTIFICATIONS_DISABLED=true`. Tests spy on
  `sendEmployeePushNotification`.
- FCM credentials come from `FIREBASE_SERVICE_ACCOUNT_KEY` (raw JSON or base64),
  falling back to application default credentials. Project id defaults to
  `basilissa-staff-app`.
- Push is **best effort**: a phone that was off or a dismissed banner loses it for
  good. Anything staff must be able to find again writes an inbox row first
  (`lib/platform/inbox.ts`) and the push points at it. Single-person notices
  (leave decisions, shift reminders) call `sendEmployeePushNotification`;
  broadcasts go through the announcements module's fan-out job, which batches
  tokens and records each person's outcome. See the
  [announcements spec](../specs/announcements.md).
- Tokens the provider says are permanently dead are pruned automatically
  (`pruneDeadPushTokens`): only the token is removed, not the binding.

### Slack

Operational only: email gateway failures, dead jobs, worker crashes,
quarantined terminal punches, OTP failures. Never a staff channel, never
containing personal data beyond what an operator needs.

## Who gets what today

| Event | Channel | Code |
| --- | --- | --- |
| Customer feedback submitted | Email to branch recipients and HR | `feedback/jobs`, `BranchFeedbackRecipient` |
| Password reset | Email | `PASSWORD_RESET_SEND` |
| Assessment or aptitude invitation | Email | `*_INVITATION_SEND` |
| Test completed | Email to HR | `*_NOTIFY_HR` |
| Staff login | SMS OTP | `mobile-auth.ts` |
| Leave decision | Push, and an inbox row | `attendance/leave.ts` |
| Shift in 15 to 60 minutes | Push, and an inbox row | `attendance/reminders.ts` |
| Announcement asked for confirmation and not confirmed | Push reminder: after 4 hours (1 if urgent), then daily, at most 3 | `announcements/jobs.ts` `remindUnacknowledged` |
| Shift started 15 to 45 minutes ago and no clock-in | Push, and an inbox row | `attendance/reminders.ts` `dispatchMissedClockInReminders` |
| Dashboard announcement | Inbox row always; push, email and SMS if chosen (SMS off by default, capped) | `announcements/service.ts`, `announcements/jobs.ts` |
| Dead job, crash, quarantine | Slack | `slack.ts` |

## Guidelines for new notifications

- **Decide the channel by what the recipient can be assumed to have**, not by
  convenience. Staff have phones; not all have an email address on file.
- **Record the attempt and the outcome**, per recipient and channel, so
  "did they get it" has an answer and failures can be retried.
- **Idempotency key** every send that a retry could repeat.
- **Queue it** (a job) when it is a consequence of a change; **never send inside
  the request** if a failure should not fail the request.
- **Never put a secret or full personal data in a push payload**; lock screens
  show it. Put an id and let the app fetch.
- **Do not log message bodies** that may carry personal data.
