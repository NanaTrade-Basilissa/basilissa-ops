import { describe, expect, it } from "vitest";
import { Role, ScopeType, UserStatus } from "@prisma/client";
import {
  can,
  hasPermission,
  isSuperAdmin,
  PERMISSION_REGISTRY,
  getPermissionMatrix,
  isValidPermissionKey,
  getAllPermissions,
  type Actor,
  type ActorAssignment,
  type ActorCustomRole,
} from "@/lib/modules/identity/authorization";

function buildActor(opts: {
  role?: Role;
  customRole?: ActorCustomRole;
  status?: UserStatus;
}): Actor {
  const assignments: ActorAssignment[] = opts.role
    ? [{ role: opts.role, scopeType: ScopeType.GLOBAL, scopeId: "" }]
    : [];

  return {
    userId: "usr_test_1",
    name: "Test User",
    email: "test@basilissa.gh",
    status: opts.status ?? UserStatus.ACTIVE,
    assignments,
    customRole: opts.customRole,
  };
}

describe("Permission Registry & Matrix", () => {
  it("defines permissions in strict 'resource:action' format", () => {
    const all = getAllPermissions();
    expect(all.length).toBeGreaterThanOrEqual(40);

    for (const p of all) {
      expect(p.key).toBe(`${p.resource}:${p.action}`);
      expect(p.resource).toBeTruthy();
      expect(p.action).toBeTruthy();
      expect(p.actionLabel).toBeTruthy();
    }
  });

  it("contains core required resources", () => {
    const resources = Object.keys(PERMISSION_REGISTRY);
    expect(resources).toContain("employees");
    expect(resources).toContain("attendance");
    expect(resources).toContain("assessments");
    expect(resources).toContain("aptitude");
    expect(resources).toContain("branches");
    expect(resources).toContain("schedules");
    expect(resources).toContain("feedback");
    expect(resources).toContain("questions");
    expect(resources).toContain("policies");
    expect(resources).toContain("users");
    expect(resources).toContain("roles");
    expect(resources).toContain("email_queue");
  });

  it("supports non-CRUD custom actions", () => {
    expect(PERMISSION_REGISTRY.attendance.actions).toHaveProperty("approve");
    expect(PERMISSION_REGISTRY.attendance.actions).toHaveProperty("export");
    expect(PERMISSION_REGISTRY.assessments.actions).toHaveProperty("publish");
    expect(PERMISSION_REGISTRY.assessments.actions).toHaveProperty("assign");
    expect(PERMISSION_REGISTRY.roles.actions).toHaveProperty("assign");
    expect(PERMISSION_REGISTRY.email_queue.actions).toHaveProperty("manage");
  });

  it("validates permission keys correctly via isValidPermissionKey", () => {
    expect(isValidPermissionKey("employees:create")).toBe(true);
    expect(isValidPermissionKey("attendance:approve")).toBe(true);
    expect(isValidPermissionKey("roles:delete")).toBe(true);
    expect(isValidPermissionKey("invalid_resource:read")).toBe(false);
    expect(isValidPermissionKey("employees:hack_the_db")).toBe(false);
    expect(isValidPermissionKey("")).toBe(false);
    expect(isValidPermissionKey("malformed_key")).toBe(false);
  });

  it("generates a complete UI matrix row structure", () => {
    const matrix = getPermissionMatrix();
    expect(matrix.length).toBe(Object.keys(PERMISSION_REGISTRY).length);

    const employeesRow = matrix.find((r) => r.resource === "employees");
    expect(employeesRow).toBeDefined();
    expect(employeesRow?.actions.create?.key).toBe("employees:create");
    expect(employeesRow?.actions.read?.key).toBe("employees:read");
    expect(employeesRow?.actions.update?.key).toBe("employees:update");
    expect(employeesRow?.actions.delete?.key).toBe("employees:delete");
    expect(employeesRow?.actions.export?.key).toBe("employees:export");
  });
});

describe("RBAC Authorization Engine — hasPermission & can", () => {
  describe("Custom Roles (Strict Deny-by-Default & No Inferences)", () => {
    it("grants access ONLY to explicitly assigned permissions", () => {
      const actorWithRole = buildActor({
        customRole: {
          id: "role_auditor",
          name: "Attendance Auditor",
          permissions: ["attendance:read", "attendance:export"],
        },
      });

      expect(hasPermission(actorWithRole, "attendance:read")).toBe(true);
      expect(hasPermission(actorWithRole, "attendance:export")).toBe(true);

      // Deny by default: no update or delete
      expect(hasPermission(actorWithRole, "attendance:create")).toBe(false);
      expect(hasPermission(actorWithRole, "attendance:update")).toBe(false);
      expect(hasPermission(actorWithRole, "attendance:delete")).toBe(false);
      expect(hasPermission(actorWithRole, "attendance:approve")).toBe(false);
      expect(hasPermission(actorWithRole, "employees:read")).toBe(false);
    });

    it("does NOT infer permissions (having update does NOT grant delete or create)", () => {
      const editorActor = buildActor({
        customRole: {
          id: "role_editor",
          name: "Employee Editor",
          permissions: ["employees:update"],
        },
      });

      expect(hasPermission(editorActor, "employees:update")).toBe(true);
      expect(hasPermission(editorActor, "employees:create")).toBe(false);
      expect(hasPermission(editorActor, "employees:delete")).toBe(false);
      expect(hasPermission(editorActor, "employees:read")).toBe(false);
    });

    it("denies access to an actor with an empty custom role", () => {
      const emptyRoleActor = buildActor({
        customRole: {
          id: "role_empty",
          name: "Empty Role",
          permissions: [],
        },
      });

      expect(hasPermission(emptyRoleActor, "employees:read")).toBe(false);
      expect(hasPermission(emptyRoleActor, "roles:read")).toBe(false);
      expect(hasPermission(emptyRoleActor, "attendance:read")).toBe(false);
    });

    it("denies access to an actor with no roles at all", () => {
      const noRoleActor = buildActor({});

      expect(hasPermission(noRoleActor, "employees:read")).toBe(false);
      expect(hasPermission(noRoleActor, "roles:read")).toBe(false);
      expect(hasPermission(noRoleActor, "attendance:read")).toBe(false);
    });

    it("works through can() delegating to hasPermission", () => {
      const auditor = buildActor({
        customRole: {
          id: "role_auditor",
          name: "Attendance Auditor",
          permissions: ["attendance:read"],
        },
      });

      expect(can(auditor, "attendance:read")).toBe(true);
      expect(can(auditor, "attendance:write")).toBe(false);
      expect(can(auditor, "employees:read")).toBe(false);
    });
  });

  describe("Super Admin Unrestricted Bypass", () => {
    it("super admin bypasses all permission checks unconditionally", () => {
      const superAdmin = buildActor({ role: Role.SUPER_ADMIN });

      expect(isSuperAdmin(superAdmin)).toBe(true);
      expect(hasPermission(superAdmin, "roles:create")).toBe(true);
      expect(hasPermission(superAdmin, "roles:read")).toBe(true);
      expect(hasPermission(superAdmin, "roles:update")).toBe(true);
      expect(hasPermission(superAdmin, "roles:delete")).toBe(true);
      expect(hasPermission(superAdmin, "employees:delete")).toBe(true);
      expect(hasPermission(superAdmin, "attendance:approve")).toBe(true);
      expect(hasPermission(superAdmin, "arbitrary:permission")).toBe(true);
    });

    it("super admin bypasses even if customRole permissions array is empty", () => {
      const superAdminWithCustomRole = buildActor({
        role: Role.SUPER_ADMIN,
        customRole: {
          id: "role_empty",
          name: "Empty",
          permissions: [],
        },
      });

      expect(hasPermission(superAdminWithCustomRole, "roles:delete")).toBe(true);
      expect(hasPermission(superAdminWithCustomRole, "employees:create")).toBe(true);
    });
  });

  describe("System Role Backward Compatibility", () => {
    it("maps built-in HR role to granular permissions", () => {
      const hrActor = buildActor({ role: Role.HR });

      expect(hasPermission(hrActor, "employees:read")).toBe(true);
      expect(hasPermission(hrActor, "employees:create")).toBe(true);
      expect(hasPermission(hrActor, "employees:update")).toBe(true);
      expect(hasPermission(hrActor, "attendance:read")).toBe(true);
      expect(hasPermission(hrActor, "assessments:create")).toBe(true);

      // HR cannot delete roles or manage user roles
      expect(hasPermission(hrActor, "roles:create")).toBe(false);
      expect(hasPermission(hrActor, "roles:delete")).toBe(false);
    });

    it("maps built-in Administrator role to admin access", () => {
      const adminActor = buildActor({ role: Role.ADMINISTRATOR });

      expect(hasPermission(adminActor, "roles:read")).toBe(true);
      expect(hasPermission(adminActor, "users:read")).toBe(true);
      expect(hasPermission(adminActor, "users:update")).toBe(true);
    });
  });

  describe("Account Inactive/Suspended Safety", () => {
    it("denies all permissions when user is suspended or terminated", () => {
      const suspendedUser = buildActor({
        status: UserStatus.SUSPENDED,
        customRole: {
          id: "role_manager",
          name: "All Access Custom",
          permissions: ["employees:read", "employees:create", "employees:update", "roles:read"],
        },
      });

      expect(hasPermission(suspendedUser, "employees:read")).toBe(false);
      expect(hasPermission(suspendedUser, "roles:read")).toBe(false);
      expect(can(suspendedUser, "employees:read")).toBe(false);

      const suspendedSuperAdmin = buildActor({
        role: Role.SUPER_ADMIN,
        status: UserStatus.SUSPENDED,
      });

      expect(hasPermission(suspendedSuperAdmin, "roles:create")).toBe(false);
      expect(can(suspendedSuperAdmin, "roles:create")).toBe(false);
    });
  });
});
