import { ShieldCheck } from "lucide-react";
import { Role, ScopeType, type UserStatus } from "@prisma/client";
import {
  changeUserStatus,
  grantUserRole,
  resendInvite,
  resetUserMfa,
  revokeUserRole,
} from "@/lib/modules/identity/actions";
import { RoleManager } from "@/components/admin/role-manager";
import { AccountStatusControls } from "@/components/admin/account-status-controls";
import { ResetMfaButton } from "@/components/admin/reset-mfa-button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAccraDateTime } from "@/lib/platform/date";

const STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  TERMINATED: "Terminated",
};

type ActiveRole = {
  id: string;
  role: Role;
  scopeType: ScopeType;
  scopeLabel: string;
  since: string;
  requiresMfa: boolean;
};
type RevokedRole = { id: string; role: Role; scopeLabel: string; endedAt: string };

/**
 * The actual user record view, shared by the full page (`users/[id]`, kept
 * for a direct link) and the Sheet opened from the users list. `onMutated`
 * re-fetches the Sheet's copy after a role/status change.
 */
export function UserDetailContent({
  user,
  canWrite,
  canAssign,
  roles,
  branches,
  active,
  revoked,
  isSelf,
  emailConfigured,
  onMutated,
}: {
  user: {
    id: string;
    name: string;
    email: string;
    status: UserStatus;
    lastLoginAt: Date | null;
    passwordChangedAt: Date | null;
    mfaEnabledAt: Date | null;
    createdAt: Date;
    mfaRecoveryCodesLeft: number;
  };
  canWrite: boolean;
  canAssign: boolean;
  roles: Role[];
  branches: { id: string; name: string }[];
  active: ActiveRole[];
  revoked: RevokedRole[];
  isSelf: boolean;
  emailConfigured: boolean;
  onMutated?: () => void;
}) {
  const requiresMfa = active.some((a) => a.requiresMfa);
  const neverSignedIn = user.passwordChangedAt === null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl font-bold text-foreground">{user.name}</h2>
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
          <AlertTitle>Has not set a password yet</AlertTitle>
          <AlertDescription>
            {emailConfigured
              ? "Send another invite if the first expired. It lasts an hour."
              : "Email is not configured, so they cannot reset it themselves either."}
          </AlertDescription>
        </Alert>
      )}

      {requiresMfa && user.mfaEnabledAt === null && (
        <Alert variant="destructive">
          <AlertTitle>Two-step verification required, not set up</AlertTitle>
          <AlertDescription>
            They can sign in but nothing privileged is reachable until they finish.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Roles</CardTitle>
          <CardDescription>
            What they may do, and where.{!canAssign && " Only a super admin can change this."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RoleManager
            userId={user.id}
            canAssign={canAssign}
            grantAction={grantUserRole}
            revokeAction={revokeUserRole}
            roles={roles}
            branches={branches}
            active={active}
            revoked={revoked}
            onMutated={onMutated}
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
                  ? `On · ${user.mfaRecoveryCodesLeft} recovery codes left`
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
                <ResetMfaButton action={resetUserMfa} userId={user.id} label={user.name} onMutated={onMutated} />
              )}
              <AccountStatusControls
                userId={user.id}
                email={user.email}
                name={user.name}
                status={user.status}
                isSelf={isSelf}
                statusAction={changeUserStatus}
                resendAction={resendInvite}
                emailConfigured={emailConfigured}
                onMutated={onMutated}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
