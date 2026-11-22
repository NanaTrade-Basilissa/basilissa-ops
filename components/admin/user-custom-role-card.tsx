"use client";

import { useActionState, useEffect, useState } from "react";
import { Building2, Check, Loader2, Lock, Shield } from "lucide-react";
import { toast } from "sonner";
import { assignUserCustomRoleAction, type RoleFormState } from "@/lib/modules/identity/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function UserCustomRoleCard({
  userId,
  customRole,
  scopedBranchIds = [],
  branches = [],
  availableCustomRoles,
  canAssign,
  isSuperAdmin = false,
  onMutated,
}: {
  userId: string;
  customRole?: { id: string; name: string; description?: string | null } | null;
  scopedBranchIds?: string[];
  branches?: { id: string; name: string }[];
  availableCustomRoles: { id: string; name: string; description?: string | null }[];
  canAssign: boolean;
  isSuperAdmin?: boolean;
  onMutated?: () => void;
}) {
  const [selectedRoleId, setSelectedRoleId] = useState<string>(customRole?.id ?? "");
  const [scopeMode, setScopeMode] = useState<"all" | "branches">(
    scopedBranchIds.length > 0 ? "branches" : "all",
  );
  const [selectedBranches, setSelectedBranches] = useState<string[]>(scopedBranchIds);

  const [state, formAction, isPending] = useActionState<RoleFormState, FormData>(
    assignUserCustomRoleAction,
    undefined,
  );

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSelectedRoleId(customRole?.id ?? "");
  }, [customRole]);

  useEffect(() => {
    setScopeMode(scopedBranchIds.length > 0 ? "branches" : "all");
    setSelectedBranches(scopedBranchIds);
  }, [scopedBranchIds]);

  useEffect(() => {
    if (state?.success) {
      toast.success("Role & branch scope updated.");
      onMutated?.();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, onMutated]);

  const branchNameMap = new Map(branches.map((b) => [b.id, b.name]));
  const currentScopeNames = scopedBranchIds
    .map((id) => branchNameMap.get(id))
    .filter((name): name is string => Boolean(name));

  const nextBranchesSorted =
    scopeMode === "branches" ? [...selectedBranches].sort() : [];
  const prevBranchesSorted = [...scopedBranchIds].sort();
  const scopeChanged =
    nextBranchesSorted.length !== prevBranchesSorted.length ||
    nextBranchesSorted.some((id, i) => id !== prevBranchesSorted[i]);
  const roleChanged = selectedRoleId !== (customRole?.id ?? "");
  const hasChanges = roleChanged || scopeChanged;

  function toggleBranch(branchId: string) {
    setSelectedBranches((prev) =>
      prev.includes(branchId) ? prev.filter((id) => id !== branchId) : [...prev, branchId],
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="size-4 text-primary" />
          Role &amp; Permissions
        </CardTitle>
        <CardDescription className="text-xs">
          Assign an administrator-defined role with custom or standard permissions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state?.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        <div className={`flex items-center justify-between gap-2 p-3 rounded-lg border border-border ${isSuperAdmin ? "bg-amber-500/5" : "bg-muted/20"}`}>
          <div>
            <span className="text-xs text-muted-foreground block">Currently Assigned:</span>
            {isSuperAdmin ? (
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="secondary" className="font-semibold text-xs text-amber-700 dark:text-amber-400 gap-1">
                  <Lock className="size-3.5" />
                  Super Admin
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Unrestricted system access across all modules and branches.
                </span>
              </div>
            ) : customRole ? (
              <div className="mt-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="font-semibold text-xs">
                    {customRole.name}
                  </Badge>
                  <Badge variant="outline" className="text-[11px] gap-1">
                    <Building2 className="size-3" />
                    {currentScopeNames.length > 0
                      ? currentScopeNames.join(", ")
                      : "All branches (Company-wide)"}
                  </Badge>
                </div>
                {customRole.description && (
                  <p className="text-xs text-muted-foreground">{customRole.description}</p>
                )}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground italic mt-0.5 block">
                None (No role assigned)
              </span>
            )}
          </div>
        </div>

        {canAssign && !isSuperAdmin && (
          <form action={formAction} className="space-y-3 pt-1">
            <input type="hidden" name="userId" value={userId} />

            <div className="space-y-1.5">
              <Label htmlFor="customRoleId" className="text-xs">
                Select Role
              </Label>
              <NativeSelect
                id="customRoleId"
                name="customRoleId"
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                disabled={isPending}
              >
                <option value="">None (Remove role)</option>
                {availableCustomRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="scopeMode" className="text-xs">
                Branch Scope
              </Label>
              <NativeSelect
                id="scopeMode"
                name="scopeMode"
                value={scopeMode}
                onChange={(e) => setScopeMode(e.target.value as "all" | "branches")}
                disabled={isPending || !selectedRoleId}
              >
                <option value="all">All branches (Company-wide)</option>
                <option value="branches">Specific branch(es) only</option>
              </NativeSelect>
            </div>

            {scopeMode === "branches" && selectedRoleId && (
              <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                <span className="block text-xs font-medium text-muted-foreground">
                  Managed Branch(es) ({selectedBranches.length} selected)
                </span>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {branches.map((branch) => {
                    const checked = selectedBranches.includes(branch.id);
                    return (
                      <button
                        key={branch.id}
                        type="button"
                        disabled={isPending}
                        onClick={() => toggleBranch(branch.id)}
                        className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                          checked
                            ? "border-primary bg-primary/10 font-medium text-foreground"
                            : "border-border bg-background text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span
                          className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                            checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/40"
                          }`}
                        >
                          {checked && <Check className="size-3" />}
                        </span>
                        <span className="truncate">{branch.name}</span>
                      </button>
                    );
                  })}
                </div>
                {selectedBranches.map((id) => (
                  <input key={id} type="hidden" name="scopedBranchIds" value={id} />
                ))}
                <p className="text-[11px] text-muted-foreground">
                  This user will only see and manage employees, attendance, shifts, leave, and reports for the selected branch(es).
                </p>
              </div>
            )}

            <Button
              type="submit"
              size="sm"
              disabled={
                isPending ||
                !hasChanges ||
                (scopeMode === "branches" && Boolean(selectedRoleId) && selectedBranches.length === 0)
              }
              className="gap-1.5"
            >
              {isPending && <Loader2 className="size-3.5 animate-spin" />}
              Save Role &amp; Scope
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
