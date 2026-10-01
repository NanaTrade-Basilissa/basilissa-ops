# Workflows

Recipes for the changes people make most. Each lists the files to touch, in
order, and the checks that catch the usual mistakes. Conventions behind them:
[conventions](./conventions.md).

Before any of these: read the [register](../architecture/open-decisions.md) for
the area, and read the Next.js guide in `node_modules/next/dist/docs/` if you are
touching routing, caching, or rendering. This is **Next.js 16**; APIs differ from
older versions (for example `searchParams` and `params` are Promises, and
`middleware.ts` is `proxy.ts`).

---

## Add a migration

1. Edit `prisma/schema.prisma`. Comment *why* a column exists, not what it is.
2. `pnpm db:migrate` locally; name it descriptively. The folder is
   `YYYYMMDDHHMMSS_snake_case`.
3. Prefer **additive** changes (new nullable column, new table) so old and new
   code both run between migrate and deploy.
4. If it touches `attendance_events`, `attendance_corrections` or `audit_logs`,
   handle the trigger explicitly. Never weaken one.
5. Raw SQL (partial indexes, triggers, check constraints) goes in the migration
   file by hand; Prisma cannot express them. Add a comment saying so, so the next
   `migrate dev` does not look like drift to a reader.
6. Verify against a **scratch database** with `prisma migrate deploy`
   ([testing](./testing-and-verification.md#database-bound-work)).
7. Update [data-model](./data-model.md) if a group or invariant changed, and add
   the production steps to HANDOVER and the register ("built, not yet migrated").
8. **Never run it against production.** The user runs
   `pnpm db:migrate:deploy:prod`.

## Add a permission

1. Add the action to `PERMISSION_REGISTRY` in
   `lib/modules/identity/permissions.ts` (label, description). This feeds the
   Roles matrix. `syncPermissionRegistry` writes `PermissionRecord` rows at seed
   and when custom roles are saved.
2. If roles should hold it by default, add it to the `SystemPermission` union and
   to the right roles in `ROLE_PERMISSIONS` (`authorization.ts`). Deny by default:
   a role not listed does not have it. If a legacy `resource:verb` should cover
   the granular one, extend `SYSTEM_TO_GRANULAR`.
3. Guard every page and every Server Action that uses it.
4. Add or extend a test in `tests/authorization*.test.ts` (and `custom-roles`
   if relevant) covering: holder allowed, non-holder refused, branch-scoped
   holder refused for another branch.
5. Super Admin passes everything; do not test with them.

## Add an admin page

1. `app/admin/(dashboard)/<area>/page.tsx`. Server Component.
2. **First line of the component: its own guard.** `requirePermission` for a
   global page, `requireAnyBranchPermission` for a list across branches,
   `requireBranchPermission` for one branch. `tests/mfa-enforcement.test.ts`
   fails if a page relies on the layout.
3. `export const dynamic = "force-dynamic"` for live data; `metadata` for the
   title. `searchParams` is a Promise: `await` it, and validate (coerce, clamp)
   before use.
4. Pass `can(actor, "x:write")` down to hide controls the user cannot use. That
   is convenience only; the actions re-check.
5. Put the UI in `components/admin/<name>.tsx`, built from `components/ui/*`.
   Check shadcn before writing anything custom.
6. Add the nav entry in `components/admin/admin-nav.tsx` /
   `components/app-sidebar.tsx`, with the permission that makes it visible.
7. If the route must be reachable **without** a session (a reset page), add it to
   `PUBLIC_ADMIN_PATHS` in `proxy.ts`; otherwise it silently redirects to login.

## Add a Server Action

1. In the module's `actions.ts` (`"use server"`).
2. `requirePermission(...)` first. Re-check the **branch** against the actor's
   scope if one is submitted.
3. Parse with a Zod schema from `validation.ts`; return `fieldErrorsFrom(...)` on
   failure.
4. One transaction: the change, the audit entry (`recordAudit(entry, tx)`), and
   any `enqueue(..., tx)`.
5. `revalidatePath(...)` the affected routes.
6. Return a `FormState`.
7. Test the service function directly, and the refusal paths. Remember the action
   is reachable by direct POST: a test that only drives the form proves little.

## Add a mobile endpoint

1. `app/api/v1/<area>/<name>/route.ts`. Authenticate with the Bearer `deviceToken`
   (`verifyDeviceToken`); take the employee from the **token**, never from the
   body (see how `punch` logs and ignores a mismatching `employeeId`).
2. Validate the body with Zod; reject unknown shapes with 400 and a stable
   `error` code the app can switch on.
3. Rate limit anything that sends an SMS or is unauthenticated.
4. Make writes **idempotent** where a flaky network will retry (an
   idempotency key, as `punch` does).
5. **Update `lib/platform/openapi-spec.ts`** and run `tests/openapi-spec.test.ts`.
   The app team builds against that spec.
6. Add a test beside `mobile-attendance-api.test.ts` / `mobile-auth.test.ts`.
7. The mobile app is a separate repository (`basilissa-employee-app`); a breaking
   change needs a coordinated release. Prefer additive fields.

## Add a background job

1. In the module's `jobs.ts`: export a type constant (`THING_SEND`) and a handler
   `(payload, context) => Promise<void>`. `jobs.ts` must not import `server.ts` or
   anything reaching `next/navigation`.
2. Register it in `worker/registry.ts` (`HANDLERS`).
3. Enqueue **inside the transaction** of the change that causes it:
   `enqueue(THING_SEND, { id }, { runAt?, maxAttempts? }, tx)`.
4. Make the handler **idempotent** (it can run twice). For email use
   `emailOptionsForJob`.
5. Throw to retry; return to succeed. After 5 attempts it is `DEAD`, alerts Slack
   and shows on the Jobs screen.
6. If the payload carries a secret, add a purge sweep.
7. Test the handler, and test that unregistered types fail rather than vanish.
8. Boot the worker (`pnpm worker`) once; an import mistake kills it at startup.

## Add a periodic sweep

Add it to the module's `jobs.ts`, call it from `runPeriodic` in
`worker/index.ts` **in its own `try`**, and from `app/api/cron/attendance` if it
should run on platforms without a worker. Log a summary only when it did
something. A sweep must be safe to re-run (deterministic idempotency keys, as
`autoCloseKey` does).

## Send an email

1. Template in `lib/email-templates/<area>.ts`, using `layout.ts`.
2. Enqueue a job; the handler calls `sendEmail({ to, from, subject, html,
   idempotencyKey, ... })`. Do not send inside the request unless the response
   depends on it.
3. Turn a `failed` result into a thrown error in the handler so the queue retries
   (register E1, E5). Treat `skipped` as success.
4. Never put a secret in the idempotency key; it is stored and hashed into headers.

## Send a push notification

`sendEmployeePushNotification(employeeId, { title, body, data })` for one person.
Put an **id** in `data`, never personal content; lock screens show the body. It is
best effort and leaves no record. For anything staff must be able to find later,
write an inbox record first and push a pointer to it. See
[background-work](./background-work-and-notifications.md#push).

## Add a module

1. `lib/modules/<name>/` with the entry files you need.
2. Add `<name>` to `MODULES` in `eslint.config.mjs`.
3. If it has background work, a `jobs.ts` and a line in `worker/registry.ts`.
4. Add it to [codebase-map](./codebase-map.md) and, if it has terms, the glossary.

## Add a capture provider (attendance)

1. Declare it in `providers.ts` (time authority, verification, retro limit) and
   give it a baseline in `assurance.ts` (`PROVIDER_BASELINE`).
2. Write an **adapter** that produces an `IngestCommand`; do not touch
   `ingest.ts`. If you find yourself adding an `if (provider === ...)` there, the
   difference belongs in the declaration instead.
3. Handle unattributable input by quarantining, never dropping.
4. Add a `ProviderType` enum value via a migration.
5. Read [attendance-pipeline](./attendance-pipeline.md) end to end first.

## Change anything that affects pay or a test result

1. Change the **pure** function and its exhaustive test first.
2. Bump `PROJECTION_VERSION` if the projection's output changes, so old days can
   be found and replayed.
3. Think about days already settled: does a replay change history? Policy is
   effective-dated and snapshotted for exactly this.
4. Verify against Postgres on a scratch database if a transaction or constraint
   is involved.
5. Update the register if you added a provisional value or a deferral.

## Add or update a shadcn component

```bash
pnpm dlx shadcn@latest diff button      # see what would change first
pnpm dlx shadcn@latest add <name>
```

Check project-specific extensions before accepting an overwrite (`badge.tsx`'s
`rating*` variants, for example). `cn` is the `cn` package. Style through tokens in
`app/globals.css`.

## Finish any change

1. Gates, to completion, real exit codes:
   `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
2. Update docs in the same commit: register, the relevant context page,
   HANDOVER if the next step changed.
3. Delete scratch files and scratch databases.
4. Commit only when asked.
