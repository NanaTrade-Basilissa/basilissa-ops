import "server-only";
import type { PrismaClient } from "@prisma/client";
import { syncPermissionRegistry } from "./permissions";
import { scoped } from "@/lib/platform/logger";

const log = scoped("identity.standard-roles");

export type StandardRoleDefinition = {
  name: string;
  description: string;
  permissions: string[];
};

export const STANDARD_ROLES_DEFINITIONS: StandardRoleDefinition[] = [
  {
    name: "Administrator",
    description: "System administration and configuration, user accounts, and operational oversight.",
    permissions: [
      "branches:read", "branches:create", "branches:update", "branches:delete",
      "devices:read", "devices:create", "devices:update", "devices:delete",
      "questions:read", "questions:create", "questions:update", "questions:delete",
      "feedback:read", "feedback:export",
      "policies:read",
      "attendance:read", "attendance:export",
      "employees:read",
      "schedules:read", "schedules:create", "schedules:update", "schedules:publish", "schedules:delete",
      "users:read", "users:create", "users:update", "users:delete", "users:assign",
      "roles:read",
      "announcements:read", "announcements:create",
      "meals:read", "meals:create", "meals:update", "meals:delete", "meals:publish",
    ],
  },
  {
    name: "HR",
    description: "Human resources, staff assessments, applicant screening, attendance policies, and employee lifecycle management.",
    permissions: [
      "employees:read", "employees:create", "employees:update", "employees:delete", "employees:export",
      "assessments:read", "assessments:create", "assessments:update", "assessments:delete", "assessments:publish", "assessments:assign",
      "aptitude:read", "aptitude:create", "aptitude:update", "aptitude:delete", "aptitude:publish", "aptitude:assign",
      "attendance:read", "attendance:create", "attendance:update", "attendance:approve", "attendance:export",
      "policies:read", "policies:update",
      "branches:read",
      "devices:read",
      "feedback:read", "feedback:export",
      "schedules:read", "schedules:create", "schedules:update", "schedules:publish", "schedules:delete",
      "announcements:read", "announcements:create",
    ],
  },
  {
    name: "Area Manager",
    description: "Multi-branch oversight, staff scheduling, branch operations, attendance management, and terminals.",
    permissions: [
      "branches:read", "branches:create", "branches:update", "branches:delete",
      "devices:read", "devices:create", "devices:update", "devices:delete",
      "feedback:read", "feedback:export",
      "attendance:read", "attendance:create", "attendance:update", "attendance:approve", "attendance:export",
      "employees:read",
      "schedules:read", "schedules:create", "schedules:update", "schedules:publish", "schedules:delete",
      "announcements:read", "announcements:create",
      "meals:read", "meals:create", "meals:update", "meals:delete", "meals:publish",
    ],
  },
  {
    name: "Branch Manager",
    description: "Branch operations, shift scheduling, staff attendance approvals, customer feedback, and meal operations.",
    permissions: [
      "branches:read",
      "devices:read",
      "feedback:read", "feedback:export",
      "attendance:read", "attendance:create", "attendance:update", "attendance:approve", "attendance:export",
      "employees:read",
      "schedules:read", "schedules:create", "schedules:update", "schedules:publish", "schedules:delete",
      "announcements:read", "announcements:create",
      "meals:read", "meals:create", "meals:update", "meals:delete", "meals:publish",
    ],
  },
  {
    name: "Shift Supervisor",
    description: "Shift monitoring, rota viewing, employee attendance tracking, and terminal status.",
    permissions: [
      "branches:read",
      "devices:read",
      "feedback:read", "feedback:export",
      "attendance:read", "attendance:export",
      "employees:read",
      "schedules:read",
    ],
  },
  {
    name: "Employee",
    description: "Standard employee access for clocking in/out, viewing assigned shifts, and ordering meals.",
    permissions: [],
  },
];

let standardRolesSeeded = false;

/**
 * Ensures all standard system roles exist in the database with their default permissions.
 * Safe and idempotent to run on every startup or role query.
 */
export async function ensureStandardRolesExist(db: PrismaClient): Promise<number> {
  if (standardRolesSeeded) return 0;

  try {
    // 1. Ensure permission records exist
    await syncPermissionRegistry(db);

    let seededCount = 0;

    for (const def of STANDARD_ROLES_DEFINITIONS) {
      const existing = await db.customRole.findUnique({
        where: { name: def.name },
        select: { id: true },
      });

      if (!existing) {
        // Create standard role
        const created = await db.customRole.create({
          data: {
            name: def.name,
            description: def.description,
            isSystem: false, // Can be edited or deleted by Super Admin if desired
          },
        });

        if (def.permissions.length > 0) {
          const matchingPerms = await db.permissionRecord.findMany({
            where: { key: { in: def.permissions } },
            select: { id: true },
          });

          if (matchingPerms.length > 0) {
            await db.rolePermission.createMany({
              data: matchingPerms.map((p) => ({
                roleId: created.id,
                permissionId: p.id,
              })),
            });
          }
        }

        seededCount++;
        log.info("standard role seeded", { name: def.name, permissionsCount: def.permissions.length });
      }
    }

    standardRolesSeeded = true;
    return seededCount;
  } catch (error) {
    log.warn("failed to seed standard roles", { error });
    return 0;
  }
}
