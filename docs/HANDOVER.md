# Handover — 7 September 2026

Where the work stopped, what is waiting, and what to be careful of. Pairs with
[`architecture/open-decisions.md`](./architecture/open-decisions.md), which is
the authoritative register of everything provisional or unfinished.

## State

`main` and `develop` point at the same commit. 489 tests, all gates green.
**Nothing has been pushed** — `origin/main` is many commits behind, and
`develop` does not exist on the remote at all.

The production database **has been migrated up to, and including,
`20260906180000_add_employee_device_identities`** (by the user, against Neon).
**Neither `20260907120000_add_hr_assessments` nor `20260907173615_add_employee_phone`
has been deployed** — they did not exist yet at the last `migrate deploy` run.
Production is still serving the **old feedback-only code**, which works
because `admin_users` was retained rather than dropped. That intermediate
state is deliberate and can persist indefinitely, but the next deploy must run
`migrate deploy` again first, or the deployed code will fail on its first
assessments query.

## What exists

**Platform** — structured logging with redaction, three-layer rate limiting
(fails open), append-only audit log, Postgres job queue with backoff and
dead-lettering, TOTP verified against RFC test vectors, AES-256-GCM secret box,
Accra-timezone date helpers, environment validation, feature flags.

**Identity** — scoped role assignments, permission matrix, MFA enforced for
`SUPER_ADMIN`/`HR`/`ADMINISTRATOR`, password reset, user creation with
invitation links, role granting with lockout guards. Separation of duties: HR
creates accounts, only Super Admin assigns roles.

**Attendance** — a complete engine: effective-dated policy, schedule
resolution, event ingest with cross-provider dedup, direction state machine,
day projection, corrections with approval thresholds, auto-close. **Gated out
of production** (`FEATURE_ATTENDANCE`) because the payroll values are still
placeholders and no automated capture path exists.

**HR assessments** — sections and questions, an answer key, per-person
tokenised links that are emailed when an address is known and email is
configured (with a resend that mints a new link and withdraws the old one),
pure scoring, HR results view. Live in production, ungated — once the pending
migration below is applied.

**Feedback** — the original customer feedback system, unchanged in behaviour
but now branch-scoped and permission-gated.

## Blocked on the user

These are the red and amber items in the register. Nothing else is waiting.

| | What is needed | What it unblocks |
| --- | --- | --- |
| **A1** | Real payroll values: grace periods, overtime threshold, break policy, rounding | Turning attendance on at all. Every day is currently calculated with placeholders flagged "not confirmed" |
| **A2** | Branch coordinates and radii | Geofencing, Phase 5 |
| **U1/U2** | Fingerprint terminal model, protocol, network topology — needs someone to physically look at one | All of Phase 2 |
| **U9** | Act 843 / DPIA groundwork for facial verification | Phase 6. **Longest lead item — worth starting now**, it gates code that is months away |
| **E2/A4** | Worker host, and production environment values | Queued emails actually sending. Without a running worker, password reset and invitation emails sit in `jobs` unsent |

## Done: email assessment invitations

Built as specified above (that spec is preserved in git history on the commit
that closed it, and summarised in register entry B10). In short:
`lib/modules/assessments/jobs.ts` holds `ASSESSMENT_INVITATION_SEND` and
`purgeSentInvitationJobs`; `resendInvitation` in `invitations.ts` issues the
new link before revoking the old one, so a failed reissue never leaves zero
live links; the invite panel shows whether a link was emailed or needs to be
copied by hand; and the periodic sweep now sweeps a SUCCEEDED invitation-send
job at any age rather than carrying its raw token for the invitation's full
week-long TTL. Verified against a scratch database (issue, resend, the
ordering guarantee under a forced failure, and the purge split) and end to end
in a browser with a minted session. All four gates green at 452 tests.

**Left for later, on purpose:** `purgeExpiredPasswordResets` does not (yet)
adopt the same SUCCEEDED-vs-DEAD split — safe as is, since a reset token's
window is an hour rather than a week, but the tighter rule would suit it too.

## Done: a pass mark in the assessment UI

Built as specified above; the decision it depended on is now made and
recorded in B10. `passMarkPercent` is settable from the assessment's Details
form (edit only — not offered on create, since a threshold is meaningless
before any questions exist to set a ceiling), stays editable after
publishing alongside title/description/score-visibility, and an empty field
clears it back to `null` rather than to `0` — the two are different claims.
**Hiding the score hides the verdict too**: the taker-facing done page only
computes pass/fail inside the same `showScoreToTaker` branch that already
gated the number, so a taker who is not shown their score is not told
whether they passed either. HR always sees both, unconditionally, on the
result page.

Verified with a real submission through the actual taking flow (not just the
form save): published an assessment with a 50% pass mark and score visible,
answered correctly as the taker, and confirmed "100% · Passed — 50% needed"
on the taker's own done page and "100% · at or above the 50% pass mark" on
HR's result page for the same response. 459 tests, all gates green.

## Done: the any-branch gate (register C1) — with a real blocker found underneath it

`requireAnyBranchPermission` (`lib/modules/identity/dal.ts`) exists and all
four list pages (branches, feedback, employees, attendance) use it in place
of the GLOBAL-only `requirePermission`. Along the way, found and fixed a real
bug it would have turned live: `lib/modules/attendance/queries.ts` built its
query by spreading the scope's clause and then the caller's `?branchId=` over
it, so the filter replaced the scope instead of narrowing it — exactly the
shape `feedbackListWhere` exists to prevent, just not yet caught here because
reaching it needed a GLOBAL grant, which has no scope to escape. Extracted
into `dayWhere`, same pattern as `feedbackListWhere`, `AND`-ed instead of
merged. Verified against real Postgres data, not just the pure functions in
isolation: a constructed BRANCH-scoped actor's feedback query returned only
their branch's rows, and asking for a different branch with genuine
submissions in it still came back empty.

**What verification found that the spec didn't know.** Signing in as a real
`BRANCH_MANAGER` never reaches a list page — it's refused by the admin shell
layout first. `admin:access` is what gates the shell, and every role that
carries it (HR, ADMINISTRATOR, SUPER_ADMIN) carries it bundled with
`branch:read`/`feedback:read`/`employee:read`/`attendance:read` in the *same*
role. There is no way, with today's role matrix, to hold `admin:access` at
BRANCH scope without those four permissions coming along GLOBALLY in the same
assignment — so the gate and the query fix just built are both correct and
proven, and still reach nobody. Full detail in register C1.

## Done: employee bulk import (register U6, closed)

Built once the user supplied the actual data shape: a real Odoo `hr.employee`
export (254 rows — Department, Employee Name, Job Position, Work Email, Work
Phone). Two-step upload-then-confirm flow at `/admin/employees/import`
(`employee:write`), because `Employee` records can only be created/updated/
terminated — there is no delete — so a bad bulk import can't be undone.
Parsing (`exceljs`) and department-to-branch resolution are pure
(`lib/modules/employees/import.ts`, added to the ESLint module's public
entries alongside `policy`/`scoring`/etc. for the same reason: exhaustively
testable without a database) and shared verbatim between preview and commit,
so what gets written is always exactly what was previewed.

**The rule that isn't in the columns**: a Department that names a branch
("Achimota Branch Management") *is* that branch; everything else is Head
Office. "Employee Name" turned out to be `SURNAME GIVEN_NAME(S)` — confirmed
by cross-checking work-email local parts (e.g. "OTUBOAH GIDEON" against
`gideonotuboah@...`). Creating the two branches this file needed but didn't
have (`Basilissa Afienya`, `Basilissa Head Office`) requires `branch:write`,
which HR does not hold — `commitEmployeeImport` checks for it per row rather
than widening HR's authority; without it, those rows block with a message
instead of the branch being created silently.

Added `Employee.phone` (nullable, same treatment as `email`) since 241/254
rows had one and the schema had nowhere to put it — local migration only,
not yet deployed (see State above).

**Verified for real**, not just against fixtures: a throwaway HR account (no
`branch:write`) confirmed the block-without-widening-permission behavior live
via a real MFA'd session; the actual admin account then ran the real file
through the real UI in the actual dev database — 253 employees created, 1
flagged for manual entry (a single-word name, "Administrator"), both new
branches created with sensible locations, and the resulting branch-assignment
counts reconciled exactly against the source file's department breakdown.
489 tests, all gates green.

## Start here: scope the dashboard root — needs a decision first, not just code

This is next, but it is not a clean pickup the way the last three were: it
turns on a product question nobody has answered yet, and guessing at it would
bake the guess into the role matrix. Surface the question, get an answer, then
build.

**The question.** `admin:access` today means two things at once — "show the
admin navigation" and, structurally, "here is a role whose every other
permission is GLOBAL," because no role separates the two. Closing this needs
one of:

1. **A role exists that gets `admin:access` at BRANCH scope**, and the four
   list permissions stay separately scoped to what that role's assignment
   actually says — which means `admin:access` has to stop living inside
   `ROLE_PERMISSIONS[role]` as an all-or-nothing bundle and become something
   the shell checks independently of scope (any grant at all admits the
   shell; the *pages* still enforce their own scope, which they now do
   correctly). This is the bigger change, but the honest one — it's what
   "the dashboard root aggregates across all branches and nothing guards
   that" in the old C1 text was actually gesturing at.
2. **Branch-scoped managers don't get an admin UI at all yet**, and Phase 3's
   real deliverable is something narrower — a branch's own view, not the
   shared shell — in which case this task is not "scope the dashboard root"
   but "decide the branch-manager surface doesn't reuse `/admin`," and C1's
   four fixed pages are ahead of their actual consumer rather than blocked.

Both are legitimate; they lead to different code. Whoever picks this up
should ask rather than pick one — same reason the assessment pass-mark task
paused on "does hiding the score hide the verdict" instead of guessing.

**Once the direction is chosen:**
- The dashboard root (`app/admin/(dashboard)/page.tsx`) itself has no branch
  scoping in its aggregate queries at all today — that has to be added
  regardless of which direction is chosen, since it is the one page always
  reachable by anyone who clears the shell gate.
- `requireAdminShell` (`lib/modules/identity/dal.ts`) is where the shell
  check itself lives, next to the gate this session just added.

## Deferred with a reason, not forgotten

- **`/api/v1`** (B1) waits for a real consumer. A token lifecycle designed
  against no client is designed wrong, and the fingerprint terminals will
  dictate the contract.
- **The quarantine path** needs that endpoint before it has anything to
  quarantine.
- **Odoo** is an asynchronous integration and must never become a runtime
  dependency (principle P3). A conversation about using Odoo for authentication
  was left open: the actual need was a bearer token for calling Odoo's API,
  which is service-to-service auth and touches none of this.
- **Section-by-section stepping** in assessments. Answers already save as they
  are chosen, so nothing is lost on a dropped connection; stepping is a UX
  addition rather than a fix.

## Mistakes already made here, so they are not made again

- MFA enforcement shipped with an **infinite redirect loop** that locked every
  privileged role out of the admin area. It was "verified" with unauthenticated
  `curl`, which redirects before reaching the code. Use a real session.
- The worker was shipped **crash-looping** because a registry imported a
  module's `server` barrel. Every gate passed; only the worker's own logs
  showed it. Read them after touching anything the worker imports.
- A **compose `environment:` entry** silently overrode `.env.local`, because
  `${VAR:-}` interpolates from the host shell and `environment:` beats
  `env_file`. Let variables arrive through `env_file`.
- A migration was stamped with a **timestamp that collided** and sorted before
  four applied migrations. Fresh and upgraded databases would have diverged.
  Always stamp after the current last migration.
- A test failed on a **comment describing** the thing it was checking for.
  Strip comments before asserting on source.
