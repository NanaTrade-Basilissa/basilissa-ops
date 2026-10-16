import { prisma } from "../lib/platform/prisma";
import { Role } from "@prisma/client";
import { ensureStandardRolesExist } from "../lib/modules/identity/standard-roles";

/**
 * Migration Script: Migrate Users to Unified Roles & Permissions
 *
 * This script migrates all existing users who have legacy RoleAssignment entries
 * onto the unified CustomRole system by populating `user.customRoleId`.
 *
 * It is safe and idempotent: users who already have a customRoleId can be preserved.
 * It automatically runs `ensureStandardRolesExist` first to guarantee all standard
 * roles and permissions exist in the database.
 */

const ROLE_PRIORITY: Role[] = [
  Role.ADMINISTRATOR,
  Role.HR,
  Role.AREA_MANAGER,
  Role.BRANCH_MANAGER,
  Role.SHIFT_SUPERVISOR,
  Role.EMPLOYEE,
];

const ROLE_NAME_MAPPING: Record<Role, string> = {
  [Role.ADMINISTRATOR]: "Administrator",
  [Role.HR]: "HR",
  [Role.AREA_MANAGER]: "Area Manager",
  [Role.BRANCH_MANAGER]: "Branch Manager",
  [Role.SHIFT_SUPERVISOR]: "Shift Supervisor",
  [Role.EMPLOYEE]: "Employee",
  [Role.SUPER_ADMIN]: "Super Admin",
};

export async function migrateUserRoles(options: { dryRun?: boolean; overwrite?: boolean } = {}) {
  const { dryRun = false, overwrite = false } = options;

  console.log("=".repeat(60));
  console.log(`Starting User Role Migration (${dryRun ? "DRY RUN" : "LIVE EXECUTION"})`);
  console.log("=".repeat(60));

  // 1. Ensure all standard roles and permissions exist
  console.log("\n[1/3] Ensuring standard roles & permissions exist in database...");
  await ensureStandardRolesExist(prisma);

  const customRoles = await prisma.customRole.findMany({
    select: { id: true, name: true },
  });
  const roleMap = new Map<string, string>();
  for (const r of customRoles) {
    roleMap.set(r.name.toLowerCase(), r.id);
  }
  console.log(`Found ${customRoles.length} custom/standard roles in database:`, customRoles.map((r) => r.name).join(", "));

  // 2. Fetch all users with active role assignments
  console.log("\n[2/3] Fetching users and legacy role assignments...");
  const now = new Date();
  const users = await prisma.user.findMany({
    include: {
      roleAssignments: {
        where: {
          OR: [{ validTo: null }, { validTo: { gt: now } }],
        },
      },
      customRole: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Loaded ${users.length} total users from database.\n`);

  // 3. Process each user
  const stats = {
    total: users.length,
    superAdmins: 0,
    migrated: 0,
    alreadyAssigned: 0,
    byRole: {} as Record<string, number>,
  };

  for (const user of users) {
    const isSuperAdmin = user.roleAssignments.some((a) => a.role === Role.SUPER_ADMIN);

    if (isSuperAdmin) {
      stats.superAdmins++;
      stats.byRole["Super Admin"] = (stats.byRole["Super Admin"] || 0) + 1;
      console.log(`👑 [SUPER ADMIN] ${user.name} (${user.email}) -> Kept with Super Admin system bypass`);
      continue;
    }

    if (user.customRoleId && !overwrite) {
      stats.alreadyAssigned++;
      const currentRoleName = user.customRole?.name ?? "Custom";
      stats.byRole[currentRoleName] = (stats.byRole[currentRoleName] || 0) + 1;
      console.log(`✓ [ALREADY MIGRATED] ${user.name} (${user.email}) -> Role: ${currentRoleName}`);
      continue;
    }

    // Determine target role by priority
    const userLegacyRoles = user.roleAssignments.map((a) => a.role);
    let targetLegacyRole: Role = Role.EMPLOYEE;

    for (const priorityRole of ROLE_PRIORITY) {
      if (userLegacyRoles.includes(priorityRole)) {
        targetLegacyRole = priorityRole;
        break;
      }
    }

    const targetRoleName = ROLE_NAME_MAPPING[targetLegacyRole];
    const targetRoleId = roleMap.get(targetRoleName.toLowerCase());

    if (!targetRoleId) {
      console.error(`❌ Could not find target role ID for "${targetRoleName}"`);
      continue;
    }

    if (!dryRun) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          customRoleId: targetRoleId,
          sessionVersion: { increment: 1 },
        },
      });
    }

    stats.migrated++;
    stats.byRole[targetRoleName] = (stats.byRole[targetRoleName] || 0) + 1;
    console.log(
      `-> [MIGRATED] ${user.name} (${user.email}) -> Role: ${targetRoleName} (from legacy: [${userLegacyRoles.join(", ")}])`,
    );
  }

  // 4. Print Summary
  console.log("\n" + "=".repeat(60));
  console.log("MIGRATION SUMMARY:");
  console.log(`Total users processed:   ${stats.total}`);
  console.log(`Users migrated to roles: ${stats.migrated}`);
  console.log(`Already had roles:       ${stats.alreadyAssigned}`);
  console.log(`Super Admins (Bypass):   ${stats.superAdmins}`);
  console.log("\nBreakdown by Role:");
  for (const [roleName, count] of Object.entries(stats.byRole).sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${roleName.padEnd(20)}: ${count}`);
  }
  console.log("=".repeat(60) + "\n");

  return stats;
}

// Auto-run when executed directly from CLI
if (require.main === module) {
  const isDryRun = process.argv.includes("--dry-run");
  const isOverwrite = process.argv.includes("--overwrite");

  migrateUserRoles({ dryRun: isDryRun, overwrite: isOverwrite })
    .catch((err) => {
      console.error("Migration failed with error:", err);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}
