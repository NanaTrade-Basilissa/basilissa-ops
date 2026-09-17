import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/platform/prisma";
import * as auditModule from "@/lib/platform/audit";
import {
  createCustomRole,
  updateCustomRole,
  deleteCustomRole,
  assignCustomRoleToUser,
  listCustomRoles,
} from "@/lib/modules/identity/server";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockAudit = vi.spyOn(auditModule, "recordAudit").mockImplementation(async () => {});

const ACTOR = {
  userId: "admin_1",
  email: "superadmin@basilissa.gh",
  role: "SUPER_ADMIN",
};

describe("Custom Roles Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for $transaction to execute callback with prisma
    vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: unknown) => {
      if (typeof cb === "function") {
        return (cb as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return cb;
    });
    vi.spyOn(prisma.permissionRecord, "upsert").mockResolvedValue({} as never);
    vi.spyOn(prisma.permissionRecord, "findMany").mockResolvedValue([
      { id: "p1", key: "attendance:read" },
      { id: "p2", key: "attendance:approve" },
    ] as never);
    vi.spyOn(prisma.user, "updateMany").mockResolvedValue({ count: 1 } as never);
  });

  describe("createCustomRole", () => {
    it("creates a role successfully with valid permissions and audits the action", async () => {
      vi.spyOn(prisma.customRole, "findUnique").mockResolvedValueOnce(null);
      vi.spyOn(prisma.customRole, "create").mockResolvedValueOnce({
        id: "role_123",
        name: "Shift Supervisor",
        description: "Manages shift schedules and attendance",
        isSystem: false,
        createdById: ACTOR.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      vi.spyOn(prisma.rolePermission, "createMany").mockResolvedValueOnce({ count: 2 });

      const result = await createCustomRole(
        {
          name: "Shift Supervisor",
          description: "Manages shift schedules and attendance",
          permissions: ["attendance:read", "attendance:approve"],
        },
        ACTOR,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.roleId).toBe("role_123");
      }

      expect(prisma.customRole.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Shift Supervisor",
            createdById: ACTOR.userId,
          }),
        }),
      );

      expect(prisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: [
          { roleId: "role_123", permissionId: "p1" },
          { roleId: "role_123", permissionId: "p2" },
        ],
      });

      expect(mockAudit.mock.calls.length).toBe(1);
      expect(mockAudit.mock.calls[0][0]).toMatchObject({
        actor: ACTOR,
        action: "role.created",
        entityType: "CustomRole",
        entityId: "role_123",
      });
    });

    it("rejects duplicate role names", async () => {
      vi.spyOn(prisma.customRole, "findUnique").mockResolvedValueOnce({
        id: "existing_role",
        name: "Shift Supervisor",
      } as never);

      const result = await createCustomRole(
        {
          name: "Shift Supervisor",
          permissions: ["attendance:read"],
        },
        ACTOR,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("ROLE_NAME_EXISTS");
        expect(result.message).toContain("already exists");
      }
    });

    it("rejects invalid or unknown permission strings", async () => {
      vi.spyOn(prisma.customRole, "findUnique").mockResolvedValueOnce(null);

      const result = await createCustomRole(
        {
          name: "Hacker Role",
          permissions: ["unknown_resource:do_bad_things", "employees:read"],
        },
        ACTOR,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("INVALID_PERMISSIONS");
        expect(result.message).toContain("Invalid permission(s)");
      }
    });
  });

  describe("updateCustomRole", () => {
    it("updates role and permissions successfully and audits changes", async () => {
      vi.spyOn(prisma.customRole, "findUnique").mockResolvedValueOnce({
        id: "role_123",
        name: "Shift Lead",
        description: "Old description",
        isSystem: false,
        permissions: [{ permission: { key: "attendance:read" } }],
      } as never);
      vi.spyOn(prisma.customRole, "findFirst").mockResolvedValueOnce(null);
      vi.spyOn(prisma.customRole, "update").mockResolvedValueOnce({} as never);
      vi.spyOn(prisma.rolePermission, "deleteMany").mockResolvedValueOnce({ count: 1 });
      vi.spyOn(prisma.rolePermission, "createMany").mockResolvedValueOnce({ count: 2 });

      const result = await updateCustomRole(
        "role_123",
        {
          name: "Senior Shift Lead",
          description: "Updated description",
          permissions: ["attendance:read", "attendance:approve"],
        },
        ACTOR,
      );

      expect(result.ok).toBe(true);
      expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({
        where: { roleId: "role_123" },
      });
      expect(prisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: [
          { roleId: "role_123", permissionId: "p1" },
          { roleId: "role_123", permissionId: "p2" },
        ],
      });
      expect(mockAudit.mock.calls.length).toBe(1);
      expect(mockAudit.mock.calls[0][0]).toMatchObject({
        action: "role.updated",
        entityType: "CustomRole",
        entityId: "role_123",
      });
    });

    it("prevents updating system-protected roles", async () => {
      vi.spyOn(prisma.customRole, "findUnique").mockResolvedValueOnce({
        id: "sys_role",
        name: "Super Admin Protected",
        isSystem: true,
        permissions: [],
      } as never);

      const result = await updateCustomRole(
        "sys_role",
        {
          name: "New Name",
          permissions: ["roles:read"],
        },
        ACTOR,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("SYSTEM_ROLE_PROTECTED");
      }
    });

    it("returns ROLE_NOT_FOUND when updating non-existent role", async () => {
      vi.spyOn(prisma.customRole, "findUnique").mockResolvedValueOnce(null);

      const result = await updateCustomRole(
        "non_existent",
        {
          name: "Doesn't matter",
          permissions: [],
        },
        ACTOR,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("ROLE_NOT_FOUND");
      }
    });
  });

  describe("deleteCustomRole — Deletion Safety", () => {
    it("BLOCKS deletion if role is currently assigned to users (ROLE_IN_USE)", async () => {
      vi.spyOn(prisma.customRole, "findUnique").mockResolvedValueOnce({
        id: "role_in_use",
        name: "Active Role",
        isSystem: false,
      } as never);
      vi.spyOn(prisma.user, "count").mockResolvedValueOnce(3);

      const result = await deleteCustomRole("role_in_use", ACTOR);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("ROLE_IN_USE");
        expect(result.message).toContain("assigned to 3 user");
      }
    });

    it("BLOCKS deletion of system roles (SYSTEM_ROLE_PROTECTED)", async () => {
      vi.spyOn(prisma.customRole, "findUnique").mockResolvedValueOnce({
        id: "role_system",
        name: "Built-in System Role",
        isSystem: true,
      } as never);

      const result = await deleteCustomRole("role_system", ACTOR);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("SYSTEM_ROLE_PROTECTED");
      }
    });

    it("allows deletion when no users are assigned and cascades permissions", async () => {
      vi.spyOn(prisma.customRole, "findUnique").mockResolvedValueOnce({
        id: "role_unused",
        name: "Obsolete Role",
        isSystem: false,
      } as never);
      vi.spyOn(prisma.user, "count").mockResolvedValueOnce(0);
      const deleteSpy = vi.spyOn(prisma.customRole, "delete").mockResolvedValueOnce({} as never);

      const result = await deleteCustomRole("role_unused", ACTOR);

      expect(result.ok).toBe(true);
      expect(deleteSpy).toHaveBeenCalledWith({
        where: { id: "role_unused" },
      });
      expect(mockAudit.mock.calls.length).toBe(1);
      expect(mockAudit.mock.calls[0][0]).toMatchObject({
        action: "role.deleted",
        entityType: "CustomRole",
        entityId: "role_unused",
      });
    });
  });

  describe("assignCustomRoleToUser", () => {
    it("assigns role and immediately bumps sessionVersion to invalidate old tokens", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: "usr_55",
        email: "staff@basilissa.gh",
        customRoleId: null,
      } as never);
      vi.spyOn(prisma.customRole, "findUnique").mockResolvedValueOnce({
        id: "role_77",
        name: "Branch Auditor",
      } as never);
      const updateSpy = vi.spyOn(prisma.user, "update").mockResolvedValueOnce({} as never);

      const result = await assignCustomRoleToUser("usr_55", "role_77", ACTOR);

      expect(result.ok).toBe(true);
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: "usr_55" },
        data: {
          customRoleId: "role_77",
          sessionVersion: { increment: 1 },
        },
      });
      expect(mockAudit.mock.calls.length).toBe(1);
      expect(mockAudit.mock.calls[0][0]).toMatchObject({
        action: "user.custom_role_assigned",
        entityType: "User",
        entityId: "usr_55",
      });
    });

    it("allows unassigning custom role by setting customRoleId to null", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: "usr_55",
        email: "staff@basilissa.gh",
        customRoleId: "role_77",
        customRole: { id: "role_77", name: "Branch Auditor" },
      } as never);
      const updateSpy = vi.spyOn(prisma.user, "update").mockResolvedValueOnce({} as never);

      const result = await assignCustomRoleToUser("usr_55", null, ACTOR);

      expect(result.ok).toBe(true);
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: "usr_55" },
        data: {
          customRoleId: null,
          sessionVersion: { increment: 1 },
        },
      });
      expect(mockAudit.mock.calls.length).toBe(1);
      expect(mockAudit.mock.calls[0][0]).toMatchObject({
        action: "user.custom_role_removed",
        entityType: "User",
        entityId: "usr_55",
      });
    });

    it("fails when user is not found", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce(null);

      const result = await assignCustomRoleToUser("non_existent_usr", "role_77", ACTOR);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("USER_NOT_FOUND");
      }
    });

    it("fails when specified role does not exist", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: "usr_55",
        customRoleId: null,
      } as never);
      vi.spyOn(prisma.customRole, "findUnique").mockResolvedValueOnce(null);

      const result = await assignCustomRoleToUser("usr_55", "ghost_role", ACTOR);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("ROLE_NOT_FOUND");
      }
    });
  });

  describe("listCustomRoles", () => {
    it("returns roles formatted with userCount, permissionCount and permissions list", async () => {
      vi.spyOn(prisma.customRole, "findMany").mockResolvedValueOnce([
        {
          id: "role_a",
          name: "Manager",
          description: "Branch manager custom role",
          isSystem: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdById: "admin_1",
          createdBy: { id: "admin_1", name: "Admin", email: "admin@basilissa.gh" },
          _count: { users: 4, permissions: 2 },
          permissions: [
            { permission: { key: "employees:read" } },
            { permission: { key: "attendance:read" } },
          ],
        },
      ] as never);

      const roles = await listCustomRoles();
      expect(roles.length).toBe(1);
      expect(roles[0].name).toBe("Manager");
      expect(roles[0].userCount).toBe(4);
      expect(roles[0].permissionCount).toBe(2);
      expect(roles[0].permissions).toEqual(["employees:read", "attendance:read"]);
    });
  });
});
