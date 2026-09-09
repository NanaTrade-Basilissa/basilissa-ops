"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Plus, ShieldAlert, X } from "lucide-react";
import type { Role, ScopeType } from "@prisma/client";
import type { RoleActionState } from "@/lib/modules/identity/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

type ActiveRole = {
  id: string;
  role: Role;
  scopeType: ScopeType;
  scopeLabel: string;
  since: string;
  requiresMfa: boolean;
};

type RevokedRole = { id: string; role: Role; scopeLabel: string; endedAt: string };

function humanise(role: string): string {
  return role.toLowerCase().replace(/_/g, " ");
}

export function RoleManager({
  userId,
  canAssign,
  grantAction,
  revokeAction,
  roles,
  branches,
  active,
  revoked,
  onMutated,
}: {
  userId: string;
  canAssign: boolean;
  grantAction: (prev: RoleActionState, formData: FormData) => Promise<RoleActionState>;
  revokeAction: (prev: RoleActionState, formData: FormData) => Promise<RoleActionState>;
  roles: Role[];
  branches: { id: string; name: string }[];
  active: ActiveRole[];
  revoked: RevokedRole[];
  onMutated?: () => void;
}) {
  const [grantState, grant, granting] = useActionState<RoleActionState, FormData>(
    grantAction,
    undefined,
  );
  const [revokeState, revokeRole, revoking] = useActionState<RoleActionState, FormData>(
    revokeAction,
    undefined,
  );
  const [scopeType, setScopeType] = useState<"GLOBAL" | "BRANCH">("GLOBAL");

  useEffect(() => {
    if (grantState?.done || revokeState?.done) onMutated?.();
  }, [grantState, revokeState, onMutated]);

  return (
    <div className="space-y-6">
      {(grantState?.error || revokeState?.error) && (
        <Alert variant="destructive">
          <AlertDescription>{grantState?.error ?? revokeState?.error}</AlertDescription>
        </Alert>
      )}

      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No roles. They can sign in, and will see a page telling them they have no access.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {active.map((assignment) => (
            <li key={assignment.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
              <span className="text-sm font-medium capitalize">{humanise(assignment.role)}</span>
              <Badge variant="outline" className="text-xs">
                {assignment.scopeLabel}
              </Badge>
              {assignment.requiresMfa && (
                <span
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                  title="This role requires two-step verification"
                >
                  <ShieldAlert className="size-3.5" /> needs two-step
                </span>
              )}
              <span className="text-xs text-muted-foreground">since {assignment.since}</span>

              {canAssign && (
                <form action={revokeRole} className="ml-auto">
                  <input type="hidden" name="assignmentId" value={assignment.id} />
                  <Button type="submit" variant="ghost" size="sm" disabled={revoking}>
                    {revoking ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                    Revoke
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {canAssign && (
        <form action={grant} className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
          <input type="hidden" name="userId" value={userId} />

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="role">Role</Label>
              <NativeSelect id="role" name="role" defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {roles.map((role) => (
                  <option key={role} value={role} className="capitalize">
                    {humanise(role)}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="scopeType">Applies to</Label>
              <NativeSelect
                id="scopeType"
                name="scopeType"
                value={scopeType}
                onChange={(e) => setScopeType(e.target.value as "GLOBAL" | "BRANCH")}
              >
                <option value="GLOBAL">The whole company</option>
                <option value="BRANCH">One branch</option>
              </NativeSelect>
            </div>

            {/* Only rendered for BRANCH scope: a branch id on a global grant
                would sit in the resolution key and match neither path. */}
            {scopeType === "BRANCH" && (
              <div className="space-y-1.5">
                <Label htmlFor="branchId">Branch</Label>
                <NativeSelect id="branchId" name="branchId" defaultValue="">
                  <option value="" disabled>
                    Choose…
                  </option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
          </div>

          <Button type="submit" size="sm" disabled={granting}>
            {granting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Grant role
          </Button>
        </form>
      )}

      {revoked.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            {revoked.length} previously held {revoked.length === 1 ? "role" : "roles"}
          </summary>
          {/* Kept visible because an audit entry from last month names a role
              this person genuinely held then. */}
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {revoked.map((assignment) => (
              <li key={assignment.id} className="capitalize">
                {humanise(assignment.role)} · {assignment.scopeLabel} · ended{" "}
                {assignment.endedAt}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
