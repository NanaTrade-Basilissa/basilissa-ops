# Spec: One kind of role

- **Status:** Specified, not built. Needs the three decisions at the end.
- **Branch:** `feat/roles-unified`
- **Touches:** `lib/modules/identity` (authorization, session, user admin, custom roles), the Roles
  and Users screens, every admin page and Server Action that guards on a permission (about 190
  call sites in 56 files), seeds, and a data migration of live role assignments.

## Problem

Roles are built two different ways. The six built-in roles (Super Admin, Administrator, HR, Area
Manager, Branch Manager, Shift Supervisor) are written in code (`ROLE_PERMISSIONS`), cannot be
edited without a deploy, and can be limited to a branch. Custom roles live in the database and are
edited with checkboxes, but cannot be limited to a branch and a user can hold only one. The Roles
screen shows them as two different things.

## Decisions already made

| Decision | Choice |
| --- | --- |
| Super Admin | **Stays in code.** Always has everything, cannot be edited, cannot be deleted. Shown in the list, locked. |
| Every other role | **One kind: a database role** with a name, a description and checkboxes. Editable and **deletable**. The six built-ins become ordinary roles holding exactly what they hold today. |
| Scope | **Chosen per assignment**, for any role: company-wide, or one branch (one assignment per branch, as an area manager has today). |
| The Roles screen | One list. Click a role to see and edit its checkboxes. |

## What the code looks like today

- `RoleAssignment { userId, role: Role enum, scopeType, scopeId }` for built-ins; separately
  `User.customRoleId` (one, company-wide) for custom roles.
- Two permission vocabularies. Code guards use **coarse** keys (`schedule:write`, `employee:read`,
  about 30 of them, 190 call sites). The role editor shows **granular** keys from
  `PERMISSION_REGISTRY` (`schedules:create`, `schedules:update`, `schedules:publish`,
  `schedules:delete`). `SYSTEM_TO_GRANULAR` bridges them.
- Custom roles pass a coarse guard only when it maps to a **single** granular key, so a custom role
  with several boxes ticked often cannot do what its boxes say. That is a bug in the current design,
  not something to preserve.
- Rules that depend on a role's **name**, not a permission: overtime authority
  (`overtime-auth.ts`), who gets HR emails (`hr-recipients.ts`), who gets a branch's feedback alerts
  (`feedback/recipients.ts`), two-step login (`MFA_REQUIRED_ROLES`), and a few labels.

## The one hard question: what do the checkboxes mean?

Whatever the matrix shows must be **exactly what is enforced**. If it shows "Delete" unticked and a
guard still lets the role delete, the screen lies about security. There are two honest ways:

**A. Make the guards as fine as the boxes (recommended).** Move each of the ~190 guard call sites
from a coarse key to the specific granular key it really needs (`schedules:update` for editing a
rota, `schedules:delete` for removing a shift, `schedules:publish` for copying a week, and so on).
A tick means what it says. It is mechanical but needs judgement per site, so it is done area by
area, each step shippable and each guarded by the safety net below.

**B. Make the boxes as coarse as the guards.** Show one "Manage" box per area (the coarse keys the
code checks today). Much less work, but the matrix gets less detailed than it is now, and
export, publish and approve would stop being separately grantable.

During the transition (A only), a coarse guard passes only if the role holds **every** granular key
in its bundle: fail closed, never open. A role missing one box loses the bundle, never gains it.

## Data model

- `roles` (exists, table of `CustomRole`): keeps `name`, `description`, `createdAt`. `isSystem` is
  dropped from use (nothing but Super Admin is special, and Super Admin is not a row).
- `role_permissions` (exists): granular keys only.
- `role_assignments`: gains `roleId` (FK to `roles`, nullable). The `role` enum column stays
  **only for `SUPER_ADMIN`** (`role` set, `roleId` null) and is null for everything else. A
  constraint requires exactly one of the two.
- `users.customRoleId` is migrated into assignments (company-wide, as it works today) and then
  dropped.
- Deleting a role is refused while anyone holds it (the message lists who); reassign first.

## Migration of live data (additive first, run by the user on production)

1. Create the six built-in roles as rows, each holding **exactly** what `ROLE_PERMISSIONS` gives it
   today, expressed as granular keys through `SYSTEM_TO_GRANULAR`. Keys with no granular twin
   (`admin:access`, `attendance:manual_entry`, `role:assign`, `jobs:*`, `email_queue:*`) get one in
   the registry.
2. Point every existing assignment at its role row and keep its scope. Super Admin assignments are
   untouched.
3. Turn each user's custom role into a company-wide assignment.
4. Verify, then a later migration drops the old columns. Nothing is dropped in the first step, so
   it can be rolled back by redeploying.

## Safety net: a golden test

Before cutting over, a test computes, for **every built-in role, every permission and every scope**
(company-wide, the right branch, another branch, none), the decision the **old** code made, and
asserts the **new** code makes the identical one. Permissions cannot silently widen or narrow in the
move. The existing authorization, RBAC, super-admin and user-administration tests keep running
throughout.

## Rules that depend on a role's name (decision needed)

| Today | Becomes |
| --- | --- |
| Overtime: admins always; area managers for their branches; branch managers only if the policy allows | A permission, `attendance:authorize_overtime`, plus the existing policy switch for branch-scoped holders |
| Who gets HR emails (candidate and test notices) | A permission, `assessments:receive_alerts` |
| Who gets a branch's customer-feedback alerts | A permission, `feedback:receive_alerts`, held at that branch |
| Two-step login required | **Stays in code**, Super Admin only, as today |

## The screens

- **Roles:** one table (name, description, people holding it, branch-scopable), Super Admin first
  with a lock, no edit and no delete. Click a role for the same detail sheet and checkbox matrix for
  every role. Create, rename, edit, duplicate, delete. **Restore defaults** on the six originals.
- **Users:** assigning a role works the same for every role: pick the role, pick company-wide or a
  branch, add more assignments for more branches.
- Every change is audited, and affected people are signed out of stale sessions (the existing
  `sessionVersion` bump).

## Guardrails

- Super Admin is always allowed in code, so nobody can lock everyone out of the Roles screen. At
  least one active Super Admin must remain (existing rule, kept).
- Removing `admin:access` from a role shows a warning that its holders lose the admin area.
- Deny by default stays. A role with nothing ticked can do nothing.
- A role cannot grant what the editor does not hold: someone editing roles cannot give a role a
  permission they lack themselves (prevents escalation). Super Admin is exempt.

## Phases (each shippable)

1. **Data and enforcement, behaviour unchanged.** Migration, assignments pointing at roles,
   authorization reading permission sets from the database, the golden test.
2. **One list, one editor.** The Roles and Users screens unified, delete, restore defaults, audit.
3. **Guards as fine as the boxes (option A).** Area by area, plus the role-name rules above.
4. **Clean-up.** Drop the old columns and `ROLE_PERMISSIONS` (except Super Admin).

## Decisions needed

1. **A or B** for what the checkboxes mean (recommended: A, in the stages above).
2. **Role-name rules to permissions** as in the table above, so editing a role really changes who
   gets those emails and who can authorize overtime. Recommended: yes.
3. **Deleting a role in use:** refuse until reassigned (recommended), or unassign everyone
   automatically.
