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

import { getAllPermissions, type PermissionKey } from "./permissions";

export {
  PERMISSION_REGISTRY,
  MATRIX_ACTIONS,
  getPermissionMatrix,
  isValidPermissionKey,
  getAllPermissions,
} from "./permissions";

export type {
  MatrixRow,
  MatrixActionKey,
  PermissionKey,
  ResourceKey,
  ActionDefinition,
  ResourceDefinition,
} from "./permissions";

export type SystemPermission =
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

export type Permission = SystemPermission | PermissionKey | (string & {});

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

export type ActorCustomRole = {
  id: string;
  name: string;
  permissions: string[];
};

export type Actor = {
  userId: string;
  name: string;
  email: string;
  status: UserStatus;
  assignments: ActorAssignment[];
  customRole?: ActorCustomRole | null;
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

export const SYSTEM_TO_GRANULAR: Record<string, readonly string[]> = {
  "employee:read": ["employees:read"],
  "employee:write": ["employees:create", "employees:update", "employees:delete", "employees:export"],
  "branch:read": ["branches:read"],
  "branch:write": ["branches:create", "branches:update", "branches:delete"],
  "question:read": ["questions:read"],
  "question:write": ["questions:create", "questions:update", "questions:delete"],
  "feedback:read": ["feedback:read", "feedback:export"],
  "policy:read": ["policies:read"],
  "policy:write": ["policies:update"],
  "attendance:read": ["attendance:read", "attendance:export"],
  "attendance:write": ["attendance:create", "attendance:update"],
  "attendance:manual_entry": ["attendance:approve", "attendance:create"],
  "schedule:read": ["schedules:read"],
  "schedule:write": ["schedules:create", "schedules:update", "schedules:publish", "schedules:delete"],
  "assessment:read": ["assessments:read"],
  "assessment:write": ["assessments:create", "assessments:update", "assessments:delete", "assessments:publish", "assessments:assign"],
  "aptitude:read": ["aptitude:read"],
  "aptitude:write": ["aptitude:create", "aptitude:update", "aptitude:delete", "aptitude:publish", "aptitude:assign"],
  "user:read": ["users:read", "roles:read"],
  "user:write": ["users:create", "users:update", "users:delete"],
  "role:assign": ["roles:assign", "users:assign", "roles:create", "roles:update"],
  "email_queue:read": ["email_queue:read"],
  "email_queue:manage": ["email_queue:manage"],
};

export const GRANULAR_TO_SYSTEM: Record<string, string> = {
  "employees:read": "employee:read",
  "branches:read": "branch:read",
  "questions:read": "question:read",
  "policies:read": "policy:read",
  "attendance:read": "attendance:read",
  "schedules:read": "schedule:read",
  "assessments:read": "assessment:read",
  "aptitude:read": "aptitude:read",
  "users:read": "user:read",
  "roles:read": "user:read",
};

export type ResourceScope = {
  /** The branch a resource belongs to, when it belongs to one. */
  branchId?: string;
};

/**
 * May `actor` perform `permission`?
 *
 * Super Admin bypasses normal permission checks and has unrestricted access.
 * Custom roles are evaluated with strict deny-by-default: if not explicitly granted,
 * the permission is refused.
 */
export function can(actor: Actor, permission: Permission, resource?: ResourceScope): boolean {
  if (actor.status !== UserStatus.ACTIVE) return false;

  // Super Admin bypass: unrestricted access throughout the application
  if (isSuperAdmin(actor)) return true;

  // Special case: "admin:access" gates the admin chrome layout
  if (permission === "admin:access") {
    if (actor.customRole && actor.customRole.permissions.length > 0) return true;
    const adminGrants = grantsOf(actor).filter((grant) => grant.permission === "admin:access");
    return adminGrants.length > 0;
  }

  // Custom role checks: strict deny-by-default, no implicit inferences
  if (actor.customRole?.permissions?.length) {
    if (actor.customRole.permissions.includes(permission)) return true;

    // Single-purpose legacy alias check (e.g. employee:read <-> employees:read)
    const legacyAliases = SYSTEM_TO_GRANULAR[permission];
    if (
      legacyAliases &&
      legacyAliases.length === 1 &&
      actor.customRole.permissions.includes(legacyAliases[0]!)
    ) {
      return true;
    }
  }

  // System role assignments check
  const grants = grantsOf(actor);
  const directGrants = grants.filter((grant) => grant.permission === permission);
  if (directGrants.length > 0) {
    if (directGrants.some((grant) => grant.scopeType === ScopeType.GLOBAL)) return true;
    if (resource?.branchId !== undefined) {
      if (
        directGrants.some(
          (grant) => grant.scopeType === ScopeType.BRANCH && grant.scopeId === resource.branchId,
        )
      ) {
        return true;
      }
    }
  }

  // Granular action covered by a broader system role assignment (e.g. employee:write covering employees:create)
  for (const grant of grants) {
    const mapped = SYSTEM_TO_GRANULAR[grant.permission];
    if (mapped && mapped.includes(permission)) {
      if (grant.scopeType === ScopeType.GLOBAL) return true;
      if (
        resource?.branchId !== undefined &&
        grant.scopeType === ScopeType.BRANCH &&
        grant.scopeId === resource.branchId
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Reusable authorization helper:
 *   hasPermission(user, "employees:read")
 *   hasPermission(user, "employees:update")
 *   hasPermission(user, "attendance:approve")
 */
export function hasPermission(
  actor: Actor | null | undefined,
  permission: Permission,
  resource?: ResourceScope,
): boolean {
  if (!actor) return false;
  return can(actor, permission, resource);
}

/**
 * Which branches may `actor` exercise `permission` over?
 */
export type BranchScope =
  | { kind: "all" }
  | { kind: "branches"; branchIds: string[] }
  | { kind: "none" };

export function branchScope(actor: Actor, permission: Permission): BranchScope {
  if (actor.status !== UserStatus.ACTIVE) return { kind: "none" };
  if (isSuperAdmin(actor)) return { kind: "all" };

  // Custom roles hold company-wide (global) access by default
  if (actor.customRole?.permissions?.length) {
    if (actor.customRole.permissions.includes(permission)) return { kind: "all" };
    const legacy = SYSTEM_TO_GRANULAR[permission];
    if (legacy && legacy.length === 1 && actor.customRole.permissions.includes(legacy[0]!)) {
      return { kind: "all" };
    }
  }

  const grants = grantsOf(actor);
  const matchingGrants = grants.filter(
    (grant) =>
      grant.permission === permission || SYSTEM_TO_GRANULAR[grant.permission]?.includes(permission),
  );
  if (matchingGrants.length === 0) return { kind: "none" };

  if (matchingGrants.some((grant) => grant.scopeType === ScopeType.GLOBAL)) return { kind: "all" };

  const branchIds = [
    ...new Set(
      matchingGrants
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
  if (isSuperAdmin(actor)) return true;
  if (actor.customRole?.permissions?.includes(permission)) return true;
  const legacy = SYSTEM_TO_GRANULAR[permission];
  if (legacy && legacy.length === 1 && actor.customRole?.permissions?.includes(legacy[0]!)) {
    return true;
  }

  const grants = grantsOf(actor).filter(
    (grant) =>
      grant.permission === permission || SYSTEM_TO_GRANULAR[grant.permission]?.includes(permission),
  );
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

  if (isSuperAdmin(actor)) {
    return [
      ...new Set([
        ...getAllPermissions().map((p) => p.key),
        ...Object.values(ROLE_PERMISSIONS).flat(),
        "admin:access",
      ]),
    ];
  }

  const perms = new Set<Permission>();
  for (const grant of grantsOf(actor)) {
    if (
      grant.scopeType === ScopeType.GLOBAL ||
      (grant.scopeType === ScopeType.BRANCH && grant.scopeId.length > 0)
    ) {
      perms.add(grant.permission);
      const mapped = SYSTEM_TO_GRANULAR[grant.permission];
      if (mapped) {
        for (const m of mapped) perms.add(m);
      }
    }
  }

  if (actor.customRole?.permissions) {
    perms.add("admin:access");
    for (const p of actor.customRole.permissions) {
      perms.add(p);
      const leg = GRANULAR_TO_SYSTEM[p];
      if (leg) perms.add(leg);
    }
  }

  return [...perms];
}

export { auditActorFrom } from "./audit";

