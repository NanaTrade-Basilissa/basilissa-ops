import { Role, ScopeType, UserStatus } from "@prisma/client";

/**
 * Authorisation. Deliberately free of Prisma, `server-only` and any I/O: it is
 * a pure function of an actor and a permission, which is what makes the whole
 * matrix cheap to test exhaustively.
 *
 * The central idea is that a permission is `(role, scope)`. "Branch manager"
 * grants nothing until you say *of which branch*, so every check either names
 * a resource or asks which resources are in reach.
 *
 * Two entry points, and the second matters as much as the first:
 *
 *   can()          answers "may this actor do X to this specific thing?"
 *   branchScope()  answers "which branches may this actor do X to?", which is
 *                  what list queries need. Filtering a list in the UI is not
 *                  authorisation — the query itself has to be constrained, or
 *                  a branch manager reads another branch by changing a URL.
 */

export type Permission =
  // Feedback platform (the surface that exists today)
  | "branch:read"
  | "branch:write"
  | "question:read"
  | "question:write"
  | "feedback:read"
  // Attendance policy — the rules attendance is calculated under. Employment
  // terms, so HR owns writing them; Administrator owns system config and does
  // not get to move someone's grace period.
  | "policy:read"
  | "policy:write"
  // Attendance
  | "attendance:read"
  | "attendance:write"
  /// Recording attendance for someone else with no verification at all. The
  /// least-verified path in the system, so it is a permission of its own
  /// rather than folded into attendance:write.
  | "attendance:manual_entry"
  // People and scheduling
  | "employee:read"
  /// The employment lifecycle: hiring, transferring, terminating. HR's domain.
  | "employee:write"
  | "schedule:read"
  /// Rotas: shift templates and who works them. Operational, so branch
  /// managers hold it for their own branch.
  | "schedule:write"
  // HR assessments — scored tests sent to named people. Owned by HR, because
  // an assessment result is a judgement about a member of staff and belongs
  // with the people who own the employment relationship.
  | "assessment:read"
  /// Authoring, publishing and inviting.
  | "assessment:write"
  // Aptitude tests — timed screening sent to job CANDIDATES, not staff.
  // Deliberately its own permission rather than reusing assessment:*: the
  // module is separate (see prisma/schema.prisma's Aptitude* models), and
  // this is what actually gates it — HR owns hiring, same as it owns the
  // employment relationship assessment:* is scoped to.
  | "aptitude:read"
  /// Authoring, publishing and inviting.
  | "aptitude:write"
  // Identity
  | "user:read"
  | "user:write"
  | "role:assign"
  /// "May this person use the admin area at all?" — the shell gate only, held
  /// by HR, Administrator and Super Admin. Every page and action behind it
  /// checks the specific permission it needs, so this decides whether the
  /// navigation is shown, never what may be done.
  | "admin:access"
  // Email Queue & Background Job Administration (Super Admin only)
  | "email_queue:read"
  | "email_queue:manage";

/** A permission and the scope it was granted at. */
type Grant = {
  permission: Permission;
  /** GLOBAL grants apply everywhere; BRANCH grants only to that branch. */
  scopeType: ScopeType;
  scopeId: string;
};

export type ActorAssignment = {
  role: Role;
  scopeType: ScopeType;
  scopeId: string;
};

export type Actor = {
  userId: string;
  name: string;
  email: string;
  status: UserStatus;
  assignments: ActorAssignment[];
};

/**
 * What each role can do. Deny by default: a role absent from this table, or a
 * permission absent from a role's list, is refused.
 *
 * Roles whose real work does not exist yet (attendance, overtime, schedules)
 * intentionally hold little here. They are listed so the hierarchy is explicit
 * and so an unlisted role fails closed rather than silently inheriting.
 */
const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // Sees only their own data. Nothing branch-wide, nothing about other people.
  EMPLOYEE: [],

  // Read-only visibility over their branch. Gains live attendance in Phase 3;
  // never gains approval or correction rights.
  SHIFT_SUPERVISOR: [
    "branch:read",
    "feedback:read",
    "attendance:read",
    "employee:read",
    "schedule:read",
  ],

  // Runs their own branch. Cannot create people, change roles, or see any
  // branch other than the ones they are assigned to.
  BRANCH_MANAGER: [
    "admin:access",
    "branch:read",
    "feedback:read",
    "attendance:read",
    "attendance:write",
    "attendance:manual_entry",
    "employee:read",
    "schedule:read",
    "schedule:write",
  ],

  // Same powers as a branch manager, across every branch they hold an
  // assignment for. Until a Region entity exists that means one BRANCH-scoped
  // assignment per covered branch.
  AREA_MANAGER: [
    "admin:access",
    "branch:read",
    "branch:write",
    "feedback:read",
    "attendance:read",
    "attendance:write",
    "attendance:manual_entry",
    "employee:read",
    "schedule:read",
    "schedule:write",
  ],

  // Owns people, not systems. No branch or question configuration.
  HR: [
    "admin:access",
    "assessment:read",
    "assessment:write",
    "aptitude:read",
    "aptitude:write",
    "branch:read",
    "feedback:read",
    "policy:read",
    "policy:write",
    "attendance:read",
    "attendance:write",
    "attendance:manual_entry",
    "employee:read",
    "employee:write",
    "schedule:read",
    "schedule:write",
  ],

  // Owns system configuration and user management (except Super Admin).
  ADMINISTRATOR: [
    "admin:access",
    "branch:read",
    "branch:write",
    "question:read",
    "question:write",
    "feedback:read",
    "user:read",
    "user:write",
    // Read only: an administrator can see the rules attendance runs under,
    // but changing them is an employment-terms decision.
    "policy:read",
    "attendance:read",
    "employee:read",
    "schedule:read",
  ],

  // Everything, including granting roles. Should be one or two people.
  SUPER_ADMIN: [
    "admin:access",
    "branch:read",
    "branch:write",
    "question:read",
    "question:write",
    "feedback:read",
    "user:read",
    "user:write",
    "role:assign",
    "policy:read",
    "policy:write",
    "attendance:read",
    "attendance:write",
    "attendance:manual_entry",
    "employee:read",
    "employee:write",
    "schedule:read",
    "schedule:write",
    "assessment:read",
    "assessment:write",
    "aptitude:read",
    "aptitude:write",
    "email_queue:read",
    "email_queue:manage",
  ],
};

/** Every grant an actor holds, flattened across their assignments. */
function grantsOf(actor: Actor): Grant[] {
  if (actor.status !== UserStatus.ACTIVE) return [];

  return actor.assignments.flatMap((assignment) =>
    (ROLE_PERMISSIONS[assignment.role] ?? []).map((permission) => ({
      permission,
      scopeType: assignment.scopeType,
      scopeId: assignment.scopeId,
    })),
  );
}

export type ResourceScope = {
  /** The branch a resource belongs to, when it belongs to one. */
  branchId?: string;
};

/**
 * May `actor` perform `permission`?
 *
 * When `resource.branchId` is given, a BRANCH-scoped grant for that branch is
 * enough. When it is omitted the check is treated as branch-independent and
 * only a GLOBAL grant satisfies it — the safe reading, since "no branch named"
 * must never widen access.
 *
 * Special case: "admin:access" is the admin chrome gate. Any active assignment
 * carrying admin:access (including branch-scoped manager assignments) admits
 * the actor to the shell; every page inside applies its own specific checks.
 */
export function can(actor: Actor, permission: Permission, resource?: ResourceScope): boolean {
  const grants = grantsOf(actor).filter((grant) => grant.permission === permission);
  if (grants.length === 0) return false;

  if (permission === "admin:access") return true;

  if (grants.some((grant) => grant.scopeType === ScopeType.GLOBAL)) return true;

  if (resource?.branchId === undefined) return false;

  return grants.some(
    (grant) => grant.scopeType === ScopeType.BRANCH && grant.scopeId === resource.branchId,
  );
}

/**
 * Which branches may `actor` exercise `permission` over?
 *
 * Repositories use this to constrain queries. `all` means no branch predicate;
 * `branches` means `WHERE branchId IN (...)`; `none` means the caller must
 * return an empty result *without* querying — never fall through to unfiltered.
 */
export type BranchScope =
  | { kind: "all" }
  | { kind: "branches"; branchIds: string[] }
  | { kind: "none" };

export function branchScope(actor: Actor, permission: Permission): BranchScope {
  const grants = grantsOf(actor).filter((grant) => grant.permission === permission);
  if (grants.length === 0) return { kind: "none" };

  if (grants.some((grant) => grant.scopeType === ScopeType.GLOBAL)) return { kind: "all" };

  const branchIds = [
    ...new Set(
      grants
        .filter((grant) => grant.scopeType === ScopeType.BRANCH && grant.scopeId !== "")
        .map((grant) => grant.scopeId),
    ),
  ];

  return branchIds.length > 0 ? { kind: "branches", branchIds } : { kind: "none" };
}

/** Convenience for building a Prisma `where` clause from a BranchScope. */
export function branchWhere(scope: BranchScope): { branchId?: { in: string[] } } | null {
  switch (scope.kind) {
    case "all":
      return {};
    case "branches":
      return { branchId: { in: scope.branchIds } };
    case "none":
      return null;
  }
}

/** The permissions a role carries. Exported for the role-management UI. */
export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Returns true if the actor is active and holds a SUPER_ADMIN role assignment. */
export function isSuperAdmin(actor: Actor): boolean {
  if (actor.status !== UserStatus.ACTIVE) return false;
  return actor.assignments.some((a) => a.role === Role.SUPER_ADMIN);
}

/**
 * Returns true if the actor has either full access (GLOBAL grant) or partial
 * access (one or more BRANCH grants) to the given permission.
 *
 * Used for navigation and UI visibility gating: an item is visible if the
 * user has full or partial access to it, and hidden if they have none.
 */
export function hasAnyPermission(actor: Actor, permission: Permission): boolean {
  if (actor.status !== UserStatus.ACTIVE) return false;

  const grants = grantsOf(actor).filter((grant) => grant.permission === permission);
  if (grants.length === 0) return false;

  return grants.some(
    (grant) =>
      grant.scopeType === ScopeType.GLOBAL ||
      (grant.scopeType === ScopeType.BRANCH && grant.scopeId.length > 0),
  );
}

/**
 * Returns all distinct permissions for which the actor has full or partial access.
 * Useful for passing held permissions to the admin shell / navigation sidebar.
 */
export function heldPermissions(actor: Actor): Permission[] {
  if (actor.status !== UserStatus.ACTIVE) return [];

  const perms = new Set<Permission>();
  for (const grant of grantsOf(actor)) {
    if (
      grant.scopeType === ScopeType.GLOBAL ||
      (grant.scopeType === ScopeType.BRANCH && grant.scopeId.length > 0)
    ) {
      perms.add(grant.permission);
    }
  }
  return [...perms];
}

