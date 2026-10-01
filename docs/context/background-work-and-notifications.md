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
`APTITUDE_INVITATION_SEND`, `APTITUDE_NOTIFY_HR`. A queued job with no handler is
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
| **SMS** | `lib/platform/sms.ts` | HTTP gateway at `SMS_GATEWAY_URL` (Hubtel) | Anyone with a phone number. Currently used for **login OTPs only**. |
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
- Not configured (no `EMAIL_SERVER_URL`) means `skipped`, not an error, so local
  development works without a gateway.

### SMS

- `normalizePhoneNumber` canonicalises to `+233...`. `formatGhanaTel` formats for
  the gateway. `dispatchOtpViaGateway` sends an OTP and reports to Slack on
  failure (`notifyOtpFailure`).
- `isSmsConfigured` gates it. Simulated when unconfigured.
- **Cost per message is real.** Anything that fans out SMS needs an explicit
  opt-in and a count shown first.
- `sendSms({ recipient, message, sender? })` is the general sender (returns
  `SendSmsResult`: `ok`, `simulated`, `messageId`, `error`). OTP login uses
  `dispatchOtpViaGateway`. Anything that sends SMS to staff should use `sendSms`,
  not a second gateway client.

### Push

- `sendPushNotification(tokens, payload)` routes each token: Expo tokens
  (`ExponentPushToken[...]`) to Expo, everything else to FCM. Returns a
  `PushReceipt` per token (`ok`, `id`, `error`, `simulated`).
- `sendEmployeePushNotification(employeeId, payload)` finds the employee's
  active `MOBILE_APP` `EmployeeDeviceIdentity` rows (`revokedAt` null), reads the
  push token out of each row's JSON `label` (`parseDeviceMetadata`), and sends.
- Tokens are registered by the app at `POST /api/v1/notifications/push-token`.
- **Simulated** (logged, not sent) under `NODE_ENV=test`, `EXPO_PUSH_DISABLED=true`
  or `PUSH_NOTIFICATIONS_DISABLED=true`. Tests spy on
  `sendEmployeePushNotification`.
- FCM credentials come from `FIREBASE_SERVICE_ACCOUNT_KEY` (raw JSON or base64),
  falling back to application default credentials. Project id defaults to
  `basilissa-staff-app`.
- Push is **best effort**: no inbox, no read state, nothing to re-read later. Who
  receives a given push today is decided by the caller (leave decisions, shift
  reminders). There is no broadcast or audience targeting yet, which is what
  [the announcements spec](../specs/announcements.md) adds.
- Open item: invalid or expired tokens are reported in receipts but nothing
  prunes them (no code in `push.ts` clears a dead token).

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
| Leave decision | Push | `attendance/leave.ts` |
| Shift in 15 to 60 minutes | Push | `attendance/reminders.ts` |
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
