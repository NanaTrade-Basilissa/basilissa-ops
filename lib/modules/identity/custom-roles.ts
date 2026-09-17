import "server-only";
import { prisma } from "@/lib/platform/prisma";
import { recordAudit, type AuditActor } from "@/lib/platform/audit";
import { scoped } from "@/lib/platform/logger";
import { isValidPermissionKey, syncPermissionRegistry } from "./permissions";

const log = scoped("identity.custom-roles");

export type RoleOperationOutcome =
  | { ok: true; roleId?: string }
  | { ok: false; reason: "ROLE_NOT_FOUND" | "ROLE_NAME_EXISTS" | "ROLE_IN_USE" | "SYSTEM_ROLE_PROTECTED" | "USER_NOT_FOUND" | "INVALID_PERMISSIONS"; message: string };

import type { FormattedCustomRole } from "./constants";
export type { FormattedCustomRole };

/**
 * Returns all custom roles with user count and assigned permissions.
 */
export async function listCustomRoles(): Promise<FormattedCustomRole[]> {
  const roles = await prisma.customRole.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          users: true,
          permissions: true,
        },
      },
      permissions: {
        select: {
          permission: {
            select: { key: true },
          },
        },
      },
      createdBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    userCount: r._count.users,
    permissionCount: r._count.permissions,
    permissions: r.permissions.map((p) => p.permission.key),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    createdBy: r.createdBy,
  }));
}

/**
 * Returns a single custom role by ID with all permission keys.
 */
export async function getCustomRoleById(id: string): Promise<FormattedCustomRole | null> {
  const r = await prisma.customRole.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          users: true,
          permissions: true,
        },
      },
      permissions: {
        select: {
          permission: {
            select: { key: true },
          },
        },
      },
      createdBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  if (!r) return null;

  return {
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    userCount: r._count.users,
    permissionCount: r._count.permissions,
    permissions: r.permissions.map((p) => p.permission.key),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    createdBy: r.createdBy,
  };
}

/**
 * Creates a new custom role with the selected permissions.
 */
export async function createCustomRole(
  input: { name: string; description?: string | null; permissions: string[] },
  actor: AuditActor,
): Promise<RoleOperationOutcome> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, reason: "ROLE_NAME_EXISTS", message: "Role name is required." };
  }

  const existing = await prisma.customRole.findUnique({ where: { name } });
  if (existing) {
    return { ok: false, reason: "ROLE_NAME_EXISTS", message: "A role with that name already exists." };
  }

  const invalidKeys = input.permissions.filter((p) => !isValidPermissionKey(p));
  if (invalidKeys.length > 0) {
    return {
      ok: false,
      reason: "INVALID_PERMISSIONS",
      message: `Invalid permission(s): ${invalidKeys.join(", ")}`,
    };
  }

  // Ensure DB permissions table has all valid keys
  await syncPermissionRegistry(prisma);

  // Validate and deduplicate permissions
  const validKeys = [...new Set(input.permissions)];

  const role = await prisma.$transaction(async (tx) => {
    const createdRole = await tx.customRole.create({
      data: {
        name,
        description: input.description?.trim() || null,
        createdById: actor.userId,
      },
    });

    if (validKeys.length > 0) {
      const records = await tx.permissionRecord.findMany({
        where: { key: { in: validKeys } },
        select: { id: true, key: true },
      });

      if (records.length > 0) {
        await tx.rolePermission.createMany({
          data: records.map((rec) => ({
            roleId: createdRole.id,
            permissionId: rec.id,
          })),
        });
      }
    }

    await recordAudit(
      {
        actor,
        action: "role.created",
        entityType: "CustomRole",
        entityId: createdRole.id,
        after: {
          name,
          description: input.description?.trim() || null,
          permissions: validKeys,
        },
      },
      tx,
    );

    return createdRole;
  });

  log.info("custom role created", { roleId: role.id, name, permissionsCount: validKeys.length });
  return { ok: true, roleId: role.id };
}

/**
 * Updates an existing custom role's name, description, and permissions.
 */
export async function updateCustomRole(
  roleId: string,
  input: { name: string; description?: string | null; permissions: string[] },
  actor: AuditActor,
): Promise<RoleOperationOutcome> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, reason: "ROLE_NAME_EXISTS", message: "Role name is required." };
  }

  const role = await prisma.customRole.findUnique({
    where: { id: roleId },
    include: {
      permissions: { select: { permission: { select: { key: true } } } },
    },
  });

  if (!role) {
    return { ok: false, reason: "ROLE_NOT_FOUND", message: "Role not found." };
  }

  if (role.isSystem) {
    return { ok: false, reason: "SYSTEM_ROLE_PROTECTED", message: "System roles cannot be modified." };
  }

  const duplicate = await prisma.customRole.findFirst({
    where: { name, id: { not: roleId } },
    select: { id: true },
  });
  if (duplicate) {
    return { ok: false, reason: "ROLE_NAME_EXISTS", message: "Another role with that name already exists." };
  }

  const invalidKeys = input.permissions.filter((p) => !isValidPermissionKey(p));
  if (invalidKeys.length > 0) {
    return {
      ok: false,
      reason: "INVALID_PERMISSIONS",
      message: `Invalid permission(s): ${invalidKeys.join(", ")}`,
    };
  }

  await syncPermissionRegistry(prisma);

  const validKeys = [...new Set(input.permissions)];
  const previousKeys = role.permissions.map((p) => p.permission.key);

  await prisma.$transaction(async (tx) => {
    await tx.customRole.update({
      where: { id: roleId },
      data: {
        name,
        description: input.description?.trim() || null,
      },
    });

    // Replace permissions
    await tx.rolePermission.deleteMany({ where: { roleId } });

    if (validKeys.length > 0) {
      const records = await tx.permissionRecord.findMany({
        where: { key: { in: validKeys } },
        select: { id: true },
      });

      if (records.length > 0) {
        await tx.rolePermission.createMany({
          data: records.map((rec) => ({
            roleId,
            permissionId: rec.id,
          })),
        });
      }
    }

    // Invalidate sessions of all users assigned to this role so permissions refresh immediately
    await tx.user.updateMany({
      where: { customRoleId: roleId },
      data: { sessionVersion: { increment: 1 } },
    });

    await recordAudit(
      {
        actor,
        action: "role.updated",
        entityType: "CustomRole",
        entityId: roleId,
        before: {
          name: role.name,
          description: role.description,
          permissions: previousKeys,
        },
        after: {
          name,
          description: input.description?.trim() || null,
          permissions: validKeys,
        },
      },
      tx,
    );
  });

  log.info("custom role updated", { roleId, name, permissionsCount: validKeys.length });
  return { ok: true, roleId };
}

/**
 * Deletes a custom role safely.
 * Refuses deletion if any users are currently assigned to it.
 */
export async function deleteCustomRole(
  roleId: string,
  actor: AuditActor,
): Promise<RoleOperationOutcome> {
  const role = await prisma.customRole.findUnique({
    where: { id: roleId },
    select: { id: true, name: true, description: true, isSystem: true },
  });

  if (!role) {
    return { ok: false, reason: "ROLE_NOT_FOUND", message: "Role not found." };
  }

  if (role.isSystem) {
    return { ok: false, reason: "SYSTEM_ROLE_PROTECTED", message: "System roles cannot be deleted." };
  }

  // Deletion safety: verify no users are currently assigned
  const assignedUsersCount = await prisma.user.count({
    where: { customRoleId: roleId },
  });

  if (assignedUsersCount > 0) {
    return {
      ok: false,
      reason: "ROLE_IN_USE",
      message: `Cannot delete role "${role.name}" because it is assigned to ${assignedUsersCount} user${assignedUsersCount === 1 ? "" : "s"}. Reassign or unassign those users before deleting.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    // Delete role (cascade deletes role_permissions)
    await tx.customRole.delete({ where: { id: roleId } });

    await recordAudit(
      {
        actor,
        action: "role.deleted",
        entityType: "CustomRole",
        entityId: roleId,
        before: { name: role.name, description: role.description },
      },
      tx,
    );
  });

  log.info("custom role deleted", { roleId, name: role.name });
  return { ok: true };
}

/**
 * Assigns or removes a custom role on a user account.
 */
export async function assignCustomRoleToUser(
  userId: string,
  customRoleId: string | null,
  actor: AuditActor,
): Promise<RoleOperationOutcome> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      customRoleId: true,
      customRole: { select: { id: true, name: true } },
    },
  });

  if (!user) {
    return { ok: false, reason: "USER_NOT_FOUND", message: "No such user." };
  }

  let roleName: string | null = null;
  if (customRoleId !== null) {
    const role = await prisma.customRole.findUnique({
      where: { id: customRoleId },
      select: { id: true, name: true },
    });
    if (!role) {
      return { ok: false, reason: "ROLE_NOT_FOUND", message: "No such custom role." };
    }
    roleName = role.name;
  }

  if (user.customRoleId === customRoleId) {
    return { ok: true };
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        customRoleId,
        sessionVersion: { increment: 1 },
      },
    });

    await recordAudit(
      {
        actor,
        action: customRoleId ? "user.custom_role_assigned" : "user.custom_role_removed",
        entityType: "User",
        entityId: userId,
        before: {
          customRoleId: user.customRoleId,
          customRoleName: user.customRole?.name ?? null,
        },
        after: {
          customRoleId,
          customRoleName: roleName,
        },
        metadata: { targetEmail: user.email },
      },
      tx,
    );
  });

  log.info("user custom role changed", { userId, customRoleId });
  return { ok: true };
}
