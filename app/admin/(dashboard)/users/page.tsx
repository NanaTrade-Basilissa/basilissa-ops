import type { Metadata } from "next";
import { ShieldAlert, UserPlus } from "lucide-react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

  const missingMfa = users.filter(
    (user) =>
      user.mfaEnabledAt === null &&
      user.roleAssignments.some((a) => MFA_REQUIRED_ROLES.includes(a.role)),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Users</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Accounts that can sign in. Most staff only need an employee record, not this.
          </p>
        </div>
        {canWrite && (
          <UserDialog
            action={createUserAccount}
            emailConfigured={isEmailConfigured()}
            trigger={
              <Button size="sm">
                <UserPlus className="size-4" /> New user
              </Button>
            }
          />
        )}
      </div>

      {missingMfa.length > 0 && (
        <Alert variant="destructive">
          <ShieldAlert className="size-4" />
          <AlertTitle>
            {missingMfa.length} {missingMfa.length === 1 ? "account needs" : "accounts need"}{" "}
            two-step verification
          </AlertTitle>
          <AlertDescription>
            They can sign in but cannot reach anything privileged until they set it up.
            Nobody is locked out. They are sent to the security page instead.
          </AlertDescription>
        </Alert>
      )}

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
        }))}
      />
    </div>
  );
}
