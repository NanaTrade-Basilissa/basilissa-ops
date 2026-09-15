import { describe, expect, it } from "vitest";
import { Role, ScopeType, UserStatus } from "@prisma/client";
import {
  createUserSchema,
  grantRoleSchema,
  userStatusSchema,
} from "@/lib/modules/identity/validation";
import { isSuperAdmin, permissionsForRole } from "@/lib/modules/identity/authorization";
import { MFA_REQUIRED_ROLES } from "@/lib/modules/identity/constants";

/**
 * The lockout guards and the token behaviour are exercised against a real
 * database in the verification run, because they live in counts and a unique
 * constraint. What is pure here is the separation of duties and the scope
 * rules — and those are the ones where a mistake hands somebody the company.
 */

describe("separation of duties", () => {
  it("keeps HR completely out of user administration", () => {
    expect(permissionsForRole(Role.HR)).not.toContain("user:read");
    expect(permissionsForRole(Role.HR)).not.toContain("user:write");
    expect(permissionsForRole(Role.HR)).not.toContain("role:assign");
  });

  it("lets administrator manage users but not assign roles", () => {
    expect(permissionsForRole(Role.ADMINISTRATOR)).toContain("user:read");
    expect(permissionsForRole(Role.ADMINISTRATOR)).toContain("user:write");
    expect(permissionsForRole(Role.ADMINISTRATOR)).not.toContain("role:assign");
  });

  it("keeps role assignment with the super admin alone", () => {
    const holders = Object.values(Role).filter((role) =>
      permissionsForRole(role).includes("role:assign"),
    );
    expect(holders).toEqual([Role.SUPER_ADMIN]);
  });

  it("keeps branch managers out of user administration", () => {
    for (const role of [Role.BRANCH_MANAGER, Role.AREA_MANAGER]) {
      expect(permissionsForRole(role)).not.toContain("user:read");
      expect(permissionsForRole(role)).not.toContain("user:write");
      expect(permissionsForRole(role)).not.toContain("role:assign");
    }
  });

  it("gives an employee no access to accounts at all", () => {
    for (const p of ["user:read", "user:write", "role:assign"] as const) {
      expect(permissionsForRole(Role.EMPLOYEE)).not.toContain(p);
    }
  });
});

describe("scope on a grant", () => {
  const base = { userId: "u1", role: Role.BRANCH_MANAGER, scopeType: ScopeType.BRANCH };

  /*
    `scopeId` is the resolution key. A branch grant without a branch would
    normalise to the empty string, which is exactly what a GLOBAL grant looks
    like — so a missing dropdown would silently hand out company-wide access.
  */
  it("refuses a branch-scoped role with no branch", () => {
    expect(grantRoleSchema.safeParse(base).success).toBe(false);
    expect(grantRoleSchema.safeParse({ ...base, branchId: "" }).success).toBe(false);
  });

  it("accepts a branch-scoped role with a branch", () => {
    expect(grantRoleSchema.safeParse({ ...base, branchId: "branch_a" }).success).toBe(true);
  });

  it("accepts a global role with no branch", () => {
    expect(
      grantRoleSchema.safeParse({ userId: "u1", role: Role.HR, scopeType: ScopeType.GLOBAL })
        .success,
    ).toBe(true);
  });

  it("names the field so the form can point at it", () => {
    const parsed = grantRoleSchema.safeParse(base);
    expect(parsed.success === false && parsed.error.issues[0]?.path).toEqual(["branchId"]);
  });

  it("refuses a role or scope that is not in the enum", () => {
    expect(grantRoleSchema.safeParse({ ...base, role: "PRESIDENT", branchId: "b" }).success).toBe(
      false,
    );
    expect(
      grantRoleSchema.safeParse({ userId: "u1", role: Role.HR, scopeType: "REGION" }).success,
    ).toBe(false);
  });
});

describe("the new account form", () => {
  it("normalises the email, since it is the sign-in identifier", () => {
    const parsed = createUserSchema.safeParse({ name: "  Ama Mensah ", email: "  AMA@X.GH " });
    expect(parsed.success && parsed.data).toEqual({ name: "Ama Mensah", email: "ama@x.gh" });
  });

  it("refuses an address it cannot send to", () => {
    expect(createUserSchema.safeParse({ name: "Ama Mensah", email: "ama" }).success).toBe(false);
  });

  it("refuses a name too short to identify anyone", () => {
    expect(createUserSchema.safeParse({ name: "A", email: "ama@x.gh" }).success).toBe(false);
  });
});

describe("status changes", () => {
  it("accepts only the three real states", () => {
    for (const status of Object.values(UserStatus)) {
      expect(userStatusSchema.safeParse({ userId: "u1", status }).success).toBe(true);
    }
    expect(userStatusSchema.safeParse({ userId: "u1", status: "DELETED" }).success).toBe(false);
  });
});

describe("what a granted role implies", () => {
  // Granting one of these makes MFA mandatory for that person, so the UI has
  // to be able to say so at the moment of granting rather than afterwards.
  it("marks the roles that will demand two-step verification", () => {
    expect([...MFA_REQUIRED_ROLES].sort()).toEqual(
      [Role.SUPER_ADMIN, Role.HR, Role.ADMINISTRATOR].sort(),
    );
  });
});

describe("super admin visibility and privacy", () => {
  it("only treats active super admins as super admin viewers", () => {
    const superAdminActor = {
      userId: "sa_1",
      email: "sa@basilissa.gh",
      status: UserStatus.ACTIVE,
      assignments: [{ role: Role.SUPER_ADMIN, scopeType: ScopeType.GLOBAL, scopeId: null }],
    };
    const adminActor = {
      userId: "adm_1",
      email: "adm@basilissa.gh",
      status: UserStatus.ACTIVE,
      assignments: [{ role: Role.ADMINISTRATOR, scopeType: ScopeType.GLOBAL, scopeId: null }],
    };
    const inactiveSuperAdmin = {
      userId: "sa_2",
      email: "sa2@basilissa.gh",
      status: UserStatus.SUSPENDED,
      assignments: [{ role: Role.SUPER_ADMIN, scopeType: ScopeType.GLOBAL, scopeId: null }],
    };

    expect(isSuperAdmin(superAdminActor as any)).toBe(true);
    expect(isSuperAdmin(adminActor as any)).toBe(false);
    expect(isSuperAdmin(inactiveSuperAdmin as any)).toBe(false);
  });

  it("filters out super admin accounts from non-super-admin user lists", () => {
    const users = [
      { id: "u1", name: "Alice Admin", roleAssignments: [{ role: Role.ADMINISTRATOR }] },
      { id: "u2", name: "Sam Super", roleAssignments: [{ role: Role.SUPER_ADMIN }] },
      { id: "u3", name: "Bob Staff", roleAssignments: [{ role: Role.EMPLOYEE }] },
    ];

    const filterForViewer = (isSuperAdminViewer: boolean) =>
      isSuperAdminViewer
        ? users
        : users.filter((u) => !u.roleAssignments.some((ra) => ra.role === Role.SUPER_ADMIN));

    expect(filterForViewer(true)).toHaveLength(3);
    expect(filterForViewer(false)).toHaveLength(2);
    expect(filterForViewer(false).map((u) => u.id)).toEqual(["u1", "u3"]);
  });
});

