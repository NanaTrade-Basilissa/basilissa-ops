import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { Role, ScopeType, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { MFA_REQUIRED_ROLES, can, requirePermission } from "@/lib/modules/identity/server";
import {
  changeUserStatus,
  grantUserRole,
  resendInvite,
  resetUserMfa,
  revokeUserRole,
} from "@/lib/modules/identity/actions";
import { isEmailConfigured } from "@/lib/platform/env";
import { RoleManager } from "@/components/admin/role-manager";
import { AccountStatusControls } from "@/components/admin/account-status-controls";
import { ResetMfaButton } from "@/components/admin/reset-mfa-button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAccraDateTime } from "@/lib/platform/date";

export const metadata: Metadata = { title: "User" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  TERMINATED: "Terminated",
};

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("user:read");
  const { id } = await params;

  const canWrite = can(actor, "user:write");
  const canAssign = can(actor, "role:assign");

  const [user, branches] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        lastLoginAt: true,
        passwordChangedAt: true,
        mfaEnabledAt: true,
        createdAt: true,
        roleAssignments: {
          orderBy: { validFrom: "desc" },
          select: {
            id: true,
            role: true,
            scopeType: true,
            scopeId: true,
            validFrom: true,
            validTo: true,
          },
        },
        _count: { select: { mfaRecoveryCodes: { where: { usedAt: null } } } },
      },
    }),
    prisma.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!user) notFound();

  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const now = new Date();
  const active = user.roleAssignments.filter((a) => a.validTo === null || a.validTo > now);
  const revoked = user.roleAssignments.filter((a) => a.validTo !== null && a.validTo <= now);

  const requiresMfa = active.some((a) => MFA_REQUIRED_ROLES.includes(a.role));
  // Null means they have never chosen one, so the invite was never used.
  const neverSignedIn = user.passwordChangedAt === null;
  const isSelf = user.id === actor.userId;

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to users
      </Link>

      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">{user.name}</h1>
        <p className="text-sm text-muted-foreground">{user.email}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={user.status === "ACTIVE" ? "outline" : "destructive"}>
            {STATUS_LABEL[user.status]}
          </Badge>
          {isSelf && <Badge variant="outline">This is you</Badge>}
        </div>
      </div>

      {neverSignedIn && (
        <Alert>
          <AlertTitle>They have not set a password yet</AlertTitle>
          <AlertDescription>
            The account exists but cannot be signed into until they use their invite link.
            {isEmailConfigured()
              ? " Send another if the first expired. They last an hour."
              : " Email is not configured, so they will need to use “Forgotten password” on the sign-in page, which also cannot send. Configure email first."}
          </AlertDescription>
        </Alert>
      )}

      {requiresMfa && user.mfaEnabledAt === null && (
        <Alert variant="destructive">
          <AlertTitle>Two-step verification required but not set up</AlertTitle>
          <AlertDescription>
            They can sign in and will be sent to the security page. Nothing privileged is
            reachable until they finish.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Roles</CardTitle>
          <CardDescription>
            What they may do, and where. A role scoped to a branch reaches that branch only.
            Company-wide actions need a global grant.
            {!canAssign && " Only a super admin can change these."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RoleManager
            userId={user.id}
            canAssign={canAssign}
            grantAction={grantUserRole}
            revokeAction={revokeUserRole}
            roles={Object.values(Role)}
            branches={branches}
            active={active.map((a) => ({
              id: a.id,
              role: a.role,
              scopeType: a.scopeType,
              scopeLabel:
                a.scopeType === ScopeType.BRANCH
                  ? (branchName.get(a.scopeId) ?? "unknown branch")
                  : "company-wide",
              since: formatAccraDateTime(a.validFrom),
              requiresMfa: MFA_REQUIRED_ROLES.includes(a.role),
            }))}
            revoked={revoked.map((a) => ({
              id: a.id,
              role: a.role,
              scopeLabel:
                a.scopeType === ScopeType.BRANCH
                  ? (branchName.get(a.scopeId) ?? "unknown branch")
                  : "company-wide",
              endedAt: formatAccraDateTime(a.validTo!),
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" />
            Access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Last signed in</dt>
              <dd>{user.lastLoginAt ? formatAccraDateTime(user.lastLoginAt) : "Never"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Account created</dt>
              <dd>{formatAccraDateTime(user.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Two-step verification</dt>
              <dd>
                {user.mfaEnabledAt
                  ? `On · ${user._count.mfaRecoveryCodes} recovery codes left`
                  : "Off"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Password</dt>
              <dd>
                {user.passwordChangedAt
                  ? `Set ${formatAccraDateTime(user.passwordChangedAt)}`
                  : "Never set"}
              </dd>
            </div>
          </dl>

          {canWrite && (
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {user.mfaEnabledAt !== null && !isSelf && (
                <ResetMfaButton action={resetUserMfa} userId={user.id} label={user.name} />
              )}
              <AccountStatusControls
                userId={user.id}
                email={user.email}
                name={user.name}
                status={user.status}
                isSelf={isSelf}
                statusAction={changeUserStatus}
                resendAction={resendInvite}
                emailConfigured={isEmailConfigured()}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
