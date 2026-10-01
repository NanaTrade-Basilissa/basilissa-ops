# Authentication and permissions

Two separate worlds authenticate differently:

| World | Credential | Checked by |
| --- | --- | --- |
| **Admin web** | Session cookie `basilissa_admin_session` (signed JWT, 7 day sliding window) backed by a `Session` row | `lib/modules/identity/dal.ts` |
| **Mobile app** | Bearer `deviceToken`, issued after SMS OTP | `lib/modules/attendance/mobile-auth.ts` and each `app/api/v1` route |
| **Fingerprint terminals** | Registered serial number plus employee PIN mapping | `lib/modules/attendance/device-ingest.ts`, `app/iclock` |
| **Public pages** | Tokenised URL, or nothing (customer feedback) | the page, plus rate limits |
| **Cron** | `CRON_SECRET` as Bearer or `x-cron-secret` | `app/api/cron/attendance/route.ts` |

The rest of this page is the admin world, which is where the sharp edges are.

## Why it is shaped this way

- **A Server Action is reachable by direct POST.** Gating the page is a
  convenience. The action is the boundary, so every action re-checks its
  permission, and its feature flag if it has one.
- **A Next.js layout is not a security boundary.** It does not re-run on every
  client-side navigation. The admin `layout.tsx` gates chrome only
  (`requireAdminShell`). Every page under `app/admin/(dashboard)/` applies its
  own guard. `tests/mfa-enforcement.test.ts` fails if a page relies on the
  layout.
- **`proxy.ts` is optimistic.** It only checks that a session cookie exists, so
  protected paths redirect fast. It does not verify anything that matters.
  Verification happens in the DAL.
- **Admin sessions are stateful.** A `Session` row plus `sessionVersion` on the
  user allows instant server-side revocation. `sessionVersion` is bumped by MFA
  enrolment and reset, deactivation (the offboarding switch), and custom role
  changes. Role *assignments* are re-read from the database on every request, so
  changing one needs no bump. A valid JWT for a revoked session is refused.

## The guards

Import from `@/lib/modules/identity/server`. Pick by what the caller knows.

| Guard | Use when | Behaviour on failure |
| --- | --- | --- |
| `requireAuth()` | Any signed-in user is fine (the MFA enrolment page) | redirect to login |
| `requireAdminShell()` | The admin layout only | redirect to `/admin/no-access` |
| `requirePermission(p)` | A page or action that needs `p` **globally** | redirect to `/admin?denied=1` |
| `requirePermission(p, { branchId })` | Same, with a named branch | same |
| `requireBranchPermission(p, branchId)` | One specific branch is in hand | `notFound()` |
| `requireAnyBranchPermission(p)` | A list page with no branch chosen yet | redirect if no usable grant; returns `{ actor, scope }` |
| `currentBranchScope(p)` / `branchScope(actor, p)` | Constraining a query | returns a `BranchScope` |

Rules that are easy to get wrong:

1. **`requirePermission(p)` with no resource demands a GLOBAL grant.** Naming no
   branch must never widen access.
2. **A branch manager's list page uses `requireAnyBranchPermission`**, then
   builds its query from the returned scope. Using `requirePermission` there
   locks every branch-scoped manager out of their own branch.
3. **A `none` scope must produce an empty result without querying**, never an
   unfiltered query. Use `branchWhere(scope)`.
4. **`requirePermission(p)` applies the MFA check; `requireAuth()` does not.**
   That asymmetry is deliberate: the enrolment page must be reachable by someone
   who has not enrolled yet.
5. **Denial paths must lead somewhere that does not run the denying check.**
   The layout redirects to `/admin/no-access`, which sits outside the layout.
   Redirecting a layout's denial to a page inside it is an infinite loop. This
   already shipped broken once (register D1).

### The two kinds of page

```ts
// A page for one branch's thing
const actor = await requireBranchPermission("attendance:read", branchId);

// A list page, any branch the user may see
const { actor, scope } = await requireAnyBranchPermission("attendance:read");
const rows = await listThings({ ...branchWhere(scope) });  // 'none' handled before this

// A global-only page (policy, roles, users, jobs)
const actor = await requirePermission("policy:write");
```

### The shape of a Server Action

```ts
"use server";
export async function doThing(_prev: FormState, formData: FormData) {
  const actor = await requirePermission("x:write");          // 1. the boundary
  const parsed = schema.safeParse({ ... });                  // 2. validate
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };
  // 3. branch-scoped? re-check against the submitted branch, do not trust it
  await service(parsed.data, auditActorFrom(actor));         // 4. audit inside the transaction
  revalidatePath("/admin/...");
  return { success: true };
}
```

Register E6 records one place that still trusts a submitted branch.

## Roles and permissions

Two vocabularies coexist during a migration:

- **System permissions**, `resource:verb` (`attendance:write`,
  `employee:read`, `policy:write`). Roles map to these in `ROLE_PERMISSIONS`
  (`authorization.ts`). Deny by default: a role missing from the table, or a
  permission missing from a role's list, is refused.
- **Granular permissions**, `resource:action` from `PERMISSION_REGISTRY`
  (`permissions.ts`): `employees:update`, `attendance:approve`,
  `assessments:publish`. These are what custom roles are built from, and they
  drive the Roles screen's matrix.
- `SYSTEM_TO_GRANULAR` and `GRANULAR_TO_SYSTEM` bridge them, so a role holding
  `employee:write` also satisfies `employees:create`.

`can(actor, permission, resource?)` evaluates, in order:

1. Inactive user: refused.
2. `SUPER_ADMIN`: always allowed.
3. `admin:access`: allowed for any custom role with permissions, or any system
   role that holds it.
4. **Custom role**: allowed if its permission list contains the permission.
   *This path is not branch-scoped* (it returns true without looking at
   `resource`). Whether custom roles should be scopeable is open; treat a
   custom role as a global grant when reasoning about exposure.
5. **System role assignments**: a direct grant at `GLOBAL`, or at `BRANCH` when
   the named branch matches, or a broader legacy grant that covers a granular
   permission.
6. Otherwise refused.

### Roles at a glance

`SHIFT_SUPERVISOR` < `BRANCH_MANAGER` < `AREA_MANAGER` < `HR` <
`ADMINISTRATOR` < `SUPER_ADMIN`, with `EMPLOYEE` as the base. Exactly what each
holds is `ROLE_PERMISSIONS` in `authorization.ts`; do not restate it elsewhere.

- An **area manager** is an `AREA_MANAGER` assignment per branch they cover
  (there is no `Region` entity yet; register B4).
- **Overtime authority** is its own rule (`canAuthorizeOvertime`): admins
  always, area managers for their branches, branch managers only when the
  attendance policy allows it.
- **Self-action is forbidden** for manual entry and corrections (the actor's
  linked employee cannot be the target).

### MFA

- Enforced for `SUPER_ADMIN` (`MFA_REQUIRED_ROLES` in
  `lib/modules/identity/constants.ts`). `ADMINISTRATOR` and `HR` are
  *recommended* (`MFA_RECOMMENDED_ROLES`), prompted but not blocked.
- Enforcement **withholds privileged pages** rather than refusing sign-in: the
  user lands on `/admin/security` (which uses `requireAuth`) and cannot reach
  anything else until enrolled.
- TOTP secrets are encrypted (`secret-box.ts`); recovery codes are stored as SHA-256 hashes.
  Reset is permissioned (`user:write`), audited, bumps `sessionVersion`, and
  refuses self-reset.
- Every role in `MFA_REQUIRED_ROLES` must hold `admin:access`, or it is told to
  enrol on a page it cannot reach. `tests/mfa-enforcement.test.ts` asserts it.

## Checklist for any change that adds access

1. Is there a guard on **every page** and **every Server Action** it adds?
2. Is the permission one that exists in `PERMISSION_REGISTRY`/`SystemPermission`?
   Adding one means registry, role table, and (for custom roles) the matrix.
3. Branch-scoped data: does the query use the scope, and does `none` return
   empty?
4. Does the audit entry record who, and does it commit in the same transaction?
5. Did you test with a **real authenticated session** and a user *without* the
   permission? An unauthenticated request redirects at the outermost gate and
   exercises none of your code. See
   [testing-and-verification](./testing-and-verification.md#authenticated-verification).

## Mobile and terminal authentication, briefly

- **Mobile**: phone number, SMS OTP (`requestOtp`, `verifyOtp`), then a
  `deviceToken`. The token is **self-contained**: `createDeviceToken` seals
  `{ employeeId, deviceId, phone, issuedAt, expiresAt }` with AES-256-GCM
  (`secret-box.ts`, key derived from `SESSION_SECRET`, register C6) and it is
  valid 30 days. `verifyDeviceToken` is pure cryptography with no database
  lookup. Routes read `Authorization: Bearer <token>`; some still accept a
  `deviceToken` in the body or query for older clients. The app-store review
  account bypasses SMS for one configured phone only.
  Terminated or suspended employees are refused at punch and status
  (`EMPLOYEE_NOT_ACTIVE`), which covers offboarding. **Revoking an
  `EmployeeDeviceIdentity` does not invalidate a token already issued**, because
  `verifyDeviceToken` does no lookup (register E7).
- **Terminals**: no user concept. A punch is attributed through
  `EmployeeDeviceIdentity` (terminal serial plus PIN). Unmapped serials and PINs
  are quarantined and alert Slack.
- Neither world has a session cookie, a role, or branch scope in the admin
  sense. Their authority is "this employee, at this branch, now".
