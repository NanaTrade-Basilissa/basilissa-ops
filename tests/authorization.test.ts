import { describe, expect, it } from "vitest";
import { Role, ScopeType, UserStatus } from "@prisma/client";
import {
  branchScope,
  branchWhere,
  can,
  hasAnyPermission,
  heldPermissions,
  isSuperAdmin,
  permissionsForRole,
  type Actor,
  type ActorAssignment,
  type Permission,
} from "@/lib/modules/identity/authorization";
import { NAV_GROUPS } from "@/components/admin/admin-nav";

/**
 * authorization.ts is pure, so the whole matrix is testable without a database
 * or a request. That is the point of keeping it free of I/O: authorisation is
 * the one place where "probably right" is not good enough.
 */

function actor(assignments: ActorAssignment[], status: UserStatus = UserStatus.ACTIVE): Actor {
  return {
    userId: "user_1",
    name: "Test User",
    email: "test@basilissa.gh",
    status,
    assignments,
  };
}

const globalRole = (role: Role): ActorAssignment => ({
  role,
  scopeType: ScopeType.GLOBAL,
  scopeId: "",
});

const branchRole = (role: Role, branchId: string): ActorAssignment => ({
  role,
  scopeType: ScopeType.BRANCH,
  scopeId: branchId,
});

describe("can — scope resolution", () => {
  it("allows a globally-scoped grant anywhere", () => {
    const admin = actor([globalRole(Role.SUPER_ADMIN)]);
    expect(can(admin, "branch:write")).toBe(true);
    expect(can(admin, "branch:write", { branchId: "branch_a" })).toBe(true);
    expect(can(admin, "branch:write", { branchId: "branch_z" })).toBe(true);
  });

  it("allows a branch-scoped grant only for that branch", () => {
    const manager = actor([branchRole(Role.BRANCH_MANAGER, "branch_a")]);
    expect(can(manager, "branch:read", { branchId: "branch_a" })).toBe(true);
    expect(can(manager, "branch:read", { branchId: "branch_b" })).toBe(false);
  });

  // The important safe default: an unscoped question from someone who only
  // holds branch-scoped grants must not be read as "yes, everywhere".
  it("denies a branch-scoped actor when no branch is named", () => {
    const manager = actor([branchRole(Role.BRANCH_MANAGER, "branch_a")]);
    expect(can(manager, "branch:read")).toBe(false);
  });

  it("honours several branch assignments (an area manager before Regions exist)", () => {
    const area = actor([
      branchRole(Role.AREA_MANAGER, "branch_a"),
      branchRole(Role.AREA_MANAGER, "branch_b"),
    ]);
    expect(can(area, "branch:write", { branchId: "branch_a" })).toBe(true);
    expect(can(area, "branch:write", { branchId: "branch_b" })).toBe(true);
    expect(can(area, "branch:write", { branchId: "branch_c" })).toBe(false);
  });

  it("denies a permission no held role grants", () => {
    const hr = actor([globalRole(Role.HR)]);
    expect(can(hr, "question:write")).toBe(false);
    expect(can(hr, "user:write")).toBe(false);
    expect(can(hr, "assessment:write")).toBe(true);
  });

  it("denies everything for a user with no assignments", () => {
    const nobody = actor([]);
    const everything: Permission[] = [
      "branch:read",
      "branch:write",
      "question:read",
      "question:write",
      "feedback:read",
      "policy:read",
      "policy:write",
      "user:read",
      "user:write",
      "role:assign",
      "admin:access",
    ];
    for (const permission of everything) {
      expect(can(nobody, permission, { branchId: "branch_a" })).toBe(false);
    }
  });
});

// A suspended or terminated user keeps their row and their grants so history
// stays attributable — but must be able to do nothing at all.
describe("can — inactive users", () => {
  for (const status of [UserStatus.SUSPENDED, UserStatus.TERMINATED]) {
    it(`grants nothing to a ${status} user, even a global super admin`, () => {
      const suspended = actor([globalRole(Role.SUPER_ADMIN)], status);
      expect(can(suspended, "admin:access")).toBe(false);
      expect(can(suspended, "branch:read", { branchId: "branch_a" })).toBe(false);
      expect(branchScope(suspended, "branch:read")).toEqual({ kind: "none" });
    });
  }
});

describe("branchScope — query constraint", () => {
  it("returns all for a global grant", () => {
    expect(branchScope(actor([globalRole(Role.ADMINISTRATOR)]), "branch:read")).toEqual({
      kind: "all",
    });
  });

  it("returns the distinct branches for branch-scoped grants", () => {
    const scope = branchScope(
      actor([
        branchRole(Role.BRANCH_MANAGER, "branch_a"),
        branchRole(Role.SHIFT_SUPERVISOR, "branch_a"),
        branchRole(Role.BRANCH_MANAGER, "branch_b"),
      ]),
      "branch:read",
    );
    expect(scope.kind).toBe("branches");
    expect(scope.kind === "branches" && [...scope.branchIds].sort()).toEqual([
      "branch_a",
      "branch_b",
    ]);
  });

  it("returns none when the actor holds the role but not the permission", () => {
    expect(branchScope(actor([branchRole(Role.EMPLOYEE, "branch_a")]), "branch:read")).toEqual({
      kind: "none",
    });
  });
});

describe("branchWhere", () => {
  it("maps all to an unconstrained clause", () => {
    expect(branchWhere({ kind: "all" })).toEqual({});
  });

  it("maps branches to an IN clause", () => {
    expect(branchWhere({ kind: "branches", branchIds: ["a", "b"] })).toEqual({
      branchId: { in: ["a", "b"] },
    });
  });

  // null, not {}. An empty object would silently become "no filter", turning a
  // denied query into a full table read — the exact bug this type prevents.
  it("maps none to null so callers cannot accidentally query unfiltered", () => {
    expect(branchWhere({ kind: "none" })).toBeNull();
  });
});

describe("role matrix invariants", () => {
  it("gives EMPLOYEE no platform-wide permissions", () => {
    expect(permissionsForRole(Role.EMPLOYEE)).toEqual([]);
  });

  it("never lets a non-super-admin assign roles", () => {
    for (const role of Object.values(Role)) {
      if (role === Role.SUPER_ADMIN) continue;
      expect(permissionsForRole(role)).not.toContain("role:assign");
    }
  });

  it("keeps HR out of system configuration and user management", () => {
    expect(permissionsForRole(Role.HR)).not.toContain("question:write");
    expect(permissionsForRole(Role.HR)).not.toContain("branch:write");
    expect(permissionsForRole(Role.HR)).not.toContain("user:read");
    expect(permissionsForRole(Role.HR)).not.toContain("user:write");
    expect(permissionsForRole(Role.ADMINISTRATOR)).toContain("user:write");
  });

  it("admits branch managers to admin shell and keeps them out of user administration", () => {
    expect(permissionsForRole(Role.BRANCH_MANAGER)).toContain("admin:access");
    expect(permissionsForRole(Role.AREA_MANAGER)).toContain("admin:access");
    expect(permissionsForRole(Role.BRANCH_MANAGER)).not.toContain("user:read");
    expect(permissionsForRole(Role.AREA_MANAGER)).not.toContain("user:read");
    expect(permissionsForRole(Role.BRANCH_MANAGER)).not.toContain("policy:read");
    expect(permissionsForRole(Role.BRANCH_MANAGER)).not.toContain("question:read");
    expect(permissionsForRole(Role.AREA_MANAGER)).not.toContain("policy:read");
    expect(permissionsForRole(Role.AREA_MANAGER)).not.toContain("question:read");

    const bm = actor([branchRole(Role.BRANCH_MANAGER, "branch_a")]);
    expect(can(bm, "admin:access")).toBe(true);
  });

  // Attendance policy sets grace periods and overtime thresholds, so it is an
  // employment-terms decision rather than system configuration. HR owns it;
  // an administrator may look but not move it.
  it("lets only HR and SUPER_ADMIN change attendance policy", () => {
    const writers = Object.values(Role).filter((role) =>
      permissionsForRole(role).includes("policy:write"),
    );
    expect(writers.sort()).toEqual([Role.HR, Role.SUPER_ADMIN].sort());
    expect(permissionsForRole(Role.ADMINISTRATOR)).toContain("policy:read");
  });

  it("defines an entry for every role, so no role silently falls through", () => {
    for (const role of Object.values(Role)) {
      expect(Array.isArray(permissionsForRole(role))).toBe(true);
    }
  });

  // A regex-driven edit to this matrix once granted one role nothing and
  // another the same permission twice. Neither breaks a behaviour test, so the
  // shape is asserted directly.
  it("lists each permission at most once per role", () => {
    for (const role of Object.values(Role)) {
      const permissions = permissionsForRole(role);
      expect(new Set(permissions).size).toBe(permissions.length);
    }
  });

  it("gives every role that can see attendance the people context for it", () => {
    for (const role of Object.values(Role)) {
      if (!permissionsForRole(role).includes("attendance:read")) continue;
      expect(permissionsForRole(role)).toContain("employee:read");
    }
  });

  it("does not let a shift supervisor write anything", () => {
    for (const permission of permissionsForRole(Role.SHIFT_SUPERVISOR)) {
      expect(permission.endsWith(":write")).toBe(false);
    }
  });
});

/**
 * The subtlety that decides whether a branch-scoped manager can act at all:
 * naming no branch demands a GLOBAL grant, so the same call means "company-wide"
 * or "this branch" depending only on whether a resource is passed. Getting it
 * backwards either locks out every area manager or hands them the whole estate.
 */
describe("can — naming a branch, or not", () => {
  const areaManager = actor([
    branchRole(Role.AREA_MANAGER, "branch_a"),
    branchRole(Role.AREA_MANAGER, "branch_b"),
  ]);

  it("refuses a branch-scoped grant when no branch is named", () => {
    // Not an oversight: "no branch" is the company-wide question, and a
    // manager of two branches has not been given a company-wide answer.
    expect(can(areaManager, "branch:write")).toBe(false);
  });

  it("admits the same grant once the branch is named", () => {
    expect(can(areaManager, "branch:write", { branchId: "branch_a" })).toBe(true);
    expect(can(areaManager, "branch:write", { branchId: "branch_b" })).toBe(true);
  });

  it("still refuses a branch outside the grant", () => {
    expect(can(areaManager, "branch:write", { branchId: "branch_c" })).toBe(false);
  });

  // An absent form field arrives as "". It must not match a scope by accident.
  it("does not match an empty branch id", () => {
    expect(can(areaManager, "branch:write", { branchId: "" })).toBe(false);
  });

  it("lets a global grant answer both questions", () => {
    const admin = actor([globalRole(Role.ADMINISTRATOR)]);
    expect(can(admin, "branch:write")).toBe(true);
    expect(can(admin, "branch:write", { branchId: "branch_never_heard_of" })).toBe(true);
  });

  it("agrees with branchWhere about which branches are in play", () => {
    const scope = branchScope(areaManager, "branch:write");
    expect(branchWhere(scope)).toEqual({ branchId: { in: ["branch_a", "branch_b"] } });
  });
});

/**
 * These gates replaced a single `admin:access` door. The change is only an
 * improvement if it actually narrowed and widened the right things.
 */
describe("what moving off admin:access changed", () => {
  it("stops HR editing branches and feedback questions", () => {
    // HR keeps admin:access — they run employees and attendance policy — so
    // the old coarse gate let them rewrite the customer feedback form too.
    expect(permissionsForRole(Role.HR)).toContain("admin:access");
    expect(permissionsForRole(Role.HR)).not.toContain("branch:write");
    expect(permissionsForRole(Role.HR)).not.toContain("question:write");
  });

  it("lets an area manager access admin shell and write branches for their assigned branches", () => {
    expect(permissionsForRole(Role.AREA_MANAGER)).toContain("branch:write");
    expect(permissionsForRole(Role.AREA_MANAGER)).toContain("admin:access");
  });

  // The reason createBranch demands a global grant rather than branch:write:
  // an area manager's write authority is over branches that already exist.
  it("gives an area manager a bounded scope, never a global one", () => {
    const scoped = branchScope(actor([branchRole(Role.AREA_MANAGER, "branch_a")]), "branch:write");
    expect(scoped.kind).toBe("branches");

    const global = branchScope(actor([globalRole(Role.ADMINISTRATOR)]), "branch:write");
    expect(global.kind).toBe("all");
  });

  it("keeps question:write with the roles that own the feedback form", () => {
    const holders = Object.values(Role).filter((role) =>
      permissionsForRole(role).includes("question:write"),
    );
    expect(holders.sort()).toEqual([Role.ADMINISTRATOR, Role.SUPER_ADMIN].sort());
  });

  it("keeps email_queue permissions exclusively with SUPER_ADMIN", () => {
    const readHolders = Object.values(Role).filter((role) =>
      permissionsForRole(role).includes("email_queue:read"),
    );
    expect(readHolders).toEqual([Role.SUPER_ADMIN]);

    const manageHolders = Object.values(Role).filter((role) =>
      permissionsForRole(role).includes("email_queue:manage"),
    );
    expect(manageHolders).toEqual([Role.SUPER_ADMIN]);
  });
});

describe("isSuperAdmin", () => {
  it("returns true for active user with SUPER_ADMIN role", () => {
    const admin = actor([globalRole(Role.SUPER_ADMIN)]);
    expect(isSuperAdmin(admin)).toBe(true);
  });

  it("returns false for non-super-admin roles", () => {
    expect(isSuperAdmin(actor([globalRole(Role.ADMINISTRATOR)]))).toBe(false);
    expect(isSuperAdmin(actor([globalRole(Role.HR)]))).toBe(false);
    expect(isSuperAdmin(actor([branchRole(Role.BRANCH_MANAGER, "b1")]))).toBe(false);
  });

  it("returns false for suspended or terminated super admin", () => {
    expect(isSuperAdmin(actor([globalRole(Role.SUPER_ADMIN)], UserStatus.SUSPENDED))).toBe(false);
    expect(isSuperAdmin(actor([globalRole(Role.SUPER_ADMIN)], UserStatus.TERMINATED))).toBe(false);
  });
});

describe("hasAnyPermission and heldPermissions", () => {
  it("recognises both full (GLOBAL) and partial (BRANCH) grants", () => {
    const branchMgr = actor([branchRole(Role.BRANCH_MANAGER, "b1")]);
    expect(hasAnyPermission(branchMgr, "feedback:read")).toBe(true);
    expect(hasAnyPermission(branchMgr, "employee:read")).toBe(true);
    expect(hasAnyPermission(branchMgr, "user:read")).toBe(false);
    expect(hasAnyPermission(branchMgr, "email_queue:read")).toBe(false);

    const admin = actor([globalRole(Role.ADMINISTRATOR)]);
    expect(hasAnyPermission(admin, "user:read")).toBe(true);
    expect(hasAnyPermission(admin, "assessment:read")).toBe(false);
  });

  it("returns nothing for suspended users", () => {
    const suspended = actor([globalRole(Role.SUPER_ADMIN)], UserStatus.SUSPENDED);
    expect(hasAnyPermission(suspended, "user:read")).toBe(false);
    expect(heldPermissions(suspended)).toEqual([]);
  });

  it("gathers all held permissions into a distinct list", () => {
    const hr = actor([globalRole(Role.HR)]);
    const hrPerms = heldPermissions(hr);
    expect(hrPerms).toContain("assessment:read");
    expect(hrPerms).toContain("aptitude:read");
    expect(hrPerms).toContain("employee:read");
    expect(hrPerms).not.toContain("user:read");
    expect(hrPerms).not.toContain("email_queue:read");
    expect(hrPerms).not.toContain("question:read");
  });
});

describe("navigation visibility by role", () => {
  function getVisibleNav(actorUser: Actor) {
    const permissions = heldPermissions(actorUser);
    return NAV_GROUPS.map((group) => ({
      label: group.label,
      items: group.items.filter((item) => !item.permission || permissions.includes(item.permission)),
    })).filter((group) => group.items.length > 0);
  }

  it("shows all sections and all items to SUPER_ADMIN", () => {
    const superAdmin = actor([globalRole(Role.SUPER_ADMIN)]);
    const nav = getVisibleNav(superAdmin);

    const groupLabels = nav.map((g) => g.label);
    expect(groupLabels).toEqual(["People", "HR", "Operations", "Administration"]);

    const adminGroup = nav.find((g) => g.label === "Administration")!;
    const adminHrefs = adminGroup.items.map((i) => i.href);
    expect(adminHrefs).toContain("/admin/email-queue");
    expect(adminHrefs).toContain("/admin/users");
  });

  it("hides HR and hides Email Queue for ADMINISTRATOR", () => {
    const admin = actor([globalRole(Role.ADMINISTRATOR)]);
    const nav = getVisibleNav(admin);

    const groupLabels = nav.map((g) => g.label);
    expect(groupLabels).toEqual(["People", "Operations", "Administration"]);
    expect(groupLabels).not.toContain("HR");

    const adminGroup = nav.find((g) => g.label === "Administration")!;
    const adminHrefs = adminGroup.items.map((i) => i.href);
    expect(adminHrefs).toContain("/admin/users");
    expect(adminHrefs).not.toContain("/admin/email-queue");
  });

  it("hides Administration and Questions for HR", () => {
    const hr = actor([globalRole(Role.HR)]);
    const nav = getVisibleNav(hr);

    const groupLabels = nav.map((g) => g.label);
    expect(groupLabels).toEqual(["People", "HR", "Operations"]);
    expect(groupLabels).not.toContain("Administration");

    const opsGroup = nav.find((g) => g.label === "Operations")!;
    const opsHrefs = opsGroup.items.map((i) => i.href);
    expect(opsHrefs).toContain("/admin/feedbacks");
    expect(opsHrefs).not.toContain("/admin/questions");
  });

  it("shows only branch operational items for BRANCH_MANAGER (hiding HR, Administration, Policy, Questions)", () => {
    const manager = actor([branchRole(Role.BRANCH_MANAGER, "branch_accra")]);
    const nav = getVisibleNav(manager);

    const groupLabels = nav.map((g) => g.label);
    expect(groupLabels).toEqual(["People", "Operations"]);
    expect(groupLabels).not.toContain("HR");
    expect(groupLabels).not.toContain("Administration");

    const peopleGroup = nav.find((g) => g.label === "People")!;
    const peopleHrefs = peopleGroup.items.map((i) => i.href);
    expect(peopleHrefs).toContain("/admin/employees");
    expect(peopleHrefs).toContain("/admin/branches");
    expect(peopleHrefs).toContain("/admin/attendance");
    expect(peopleHrefs).toContain("/admin/shifts");
    expect(peopleHrefs).not.toContain("/admin/attendance/policy");

    const opsGroup = nav.find((g) => g.label === "Operations")!;
    const opsHrefs = opsGroup.items.map((i) => i.href);
    expect(opsHrefs).toContain("/admin/feedbacks");
    expect(opsHrefs).not.toContain("/admin/questions");
  });

  it("hides all navigation groups for EMPLOYEE", () => {
    const employee = actor([globalRole(Role.EMPLOYEE)]);
    const nav = getVisibleNav(employee);
    expect(nav).toEqual([]);
  });
});

describe("branch manager operational permissions on detail pages", () => {
  it("allows branch manager to read employee in branch scope but not globally", () => {
    const manager = actor([branchRole(Role.BRANCH_MANAGER, "branch_accra")]);
    // requirePermission("employee:read") demands GLOBAL and fails:
    expect(can(manager, "employee:read")).toBe(false);
    // requireAnyBranchPermission("employee:read") checks branchScope and succeeds:
    const scope = branchScope(manager, "employee:read");
    expect(scope).toEqual({ kind: "branches", branchIds: ["branch_accra"] });
  });

  it("allows branch manager to read attendance in branch scope but not globally", () => {
    const manager = actor([branchRole(Role.BRANCH_MANAGER, "branch_accra")]);
    expect(can(manager, "attendance:read")).toBe(false);
    const scope = branchScope(manager, "attendance:read");
    expect(scope).toEqual({ kind: "branches", branchIds: ["branch_accra"] });
  });

  it("allows branch manager to record manual attendance and schedule shifts only for assigned branch", () => {
    const manager = actor([branchRole(Role.BRANCH_MANAGER, "branch_accra")]);
    expect(can(manager, "attendance:manual_entry", { branchId: "branch_accra" })).toBe(true);
    expect(can(manager, "attendance:manual_entry", { branchId: "branch_kumasi" })).toBe(false);
    expect(can(manager, "schedule:write", { branchId: "branch_accra" })).toBe(true);
    expect(can(manager, "schedule:write", { branchId: "branch_kumasi" })).toBe(false);
  });
});

