import type { Metadata } from "next";
import { UserPlus } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { Role, type Prisma } from "@prisma/client";
import {
  MFA_RECOMMENDED_ROLES,
  MFA_REQUIRED_ROLES,
  can,
  isSuperAdmin,
  requirePermission,
} from "@/lib/modules/identity/server";
import { createUserAccount } from "@/lib/modules/identity/actions";
import { isEmailConfigured } from "@/lib/platform/env";
import { Button } from "@/components/ui/button";
import { UserDialog } from "@/components/admin/user-dialog";
import { UsersTable } from "@/components/admin/users-table";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const actor = await requirePermission("user:read");
  const canWrite = can(actor, "user:write");
  const isSuperAdminViewer = isSuperAdmin(actor);

  const now = new Date();
  const where: Prisma.UserWhereInput = isSuperAdminViewer
    ? {}
    : {
        roleAssignments: {
          none: {
            role: Role.SUPER_ADMIN,
          },
        },
      };

  const rawUsers = await prisma.user.findMany({
    where,
    orderBy: [{ status: "asc" }, { email: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      lastLoginAt: true,
      mfaEnabledAt: true,
      customRole: { select: { id: true, name: true } },
      roleAssignments: {
        where: { OR: [{ validTo: null }, { validTo: { gt: now } }] },
        select: { role: true, scopeType: true, scopeId: true },
      },
      _count: { select: { mfaRecoveryCodes: { where: { usedAt: null } } } },
    },
  });

  const users = isSuperAdminViewer
    ? rawUsers
    : rawUsers.filter((u) => !u.roleAssignments.some((ra) => ra.role === Role.SUPER_ADMIN));

  const branchIds = users.flatMap((user) =>
    user.roleAssignments.filter((a) => a.scopeType === "BRANCH").map((a) => a.scopeId),
  );
  const branches = await prisma.branch.findMany({
    where: { id: { in: branchIds } },
    select: { id: true, name: true },
  });
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  return (
    <div className="space-y-4">
      <UsersTable
        canWrite={canWrite}
        isSuperAdminViewer={isSuperAdminViewer}
        users={users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          status: user.status,
          lastLoginAt: user.lastLoginAt,
          mfaEnabledAt: user.mfaEnabledAt,
          recoveryCodesLeft: user._count.mfaRecoveryCodes,
          requiresMfa: user.roleAssignments.some((a) => MFA_REQUIRED_ROLES.includes(a.role)),
          recommendsMfa: user.roleAssignments.some((a) => MFA_RECOMMENDED_ROLES.includes(a.role)),
          isSuperAdmin: user.roleAssignments.some((a) => a.role === "SUPER_ADMIN"),
          roles: user.roleAssignments.map((a) => ({
            role: a.role,
            scopeType: a.scopeType,
            branchName: a.scopeType === "BRANCH" ? (branchName.get(a.scopeId) ?? null) : null,
          })),
          customRoleName: user.customRole?.name ?? null,
        }))}
        actionSlot={
          canWrite ? (
            <UserDialog
              action={createUserAccount}
              emailConfigured={isEmailConfigured()}
              trigger={
                <Button size="sm" className="h-9 gap-1.5 text-xs">
                  <UserPlus className="size-4" />
                  <span className="hidden sm:inline">New user</span>
                </Button>
              }
            />
          ) : undefined
        }
      />
    </div>
  );
}
