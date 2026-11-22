"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { CheckSquare, Loader2, Lock, Plus, Square } from "lucide-react";
import { toast } from "sonner";
import {
  createRoleAction,
  updateRoleAction,
  type RoleFormState,
} from "@/lib/modules/identity/actions";
import {
  MATRIX_ACTIONS,
  type MatrixRow,
} from "@/lib/modules/identity/authorization";
import type { FormattedCustomRole } from "@/lib/modules/identity/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";

export function RoleDialog({
  role,
  matrix,
  trigger,
  onSaved,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  readOnly: explicitReadOnly,
  grantablePermissions = null,
}: {
  role?: FormattedCustomRole;
  matrix: MatrixRow[];
  trigger?: React.ReactElement;
  onSaved?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  readOnly?: boolean;
  /** Granular permissions the current user holds, or null for unrestricted Super Admin. */
  grantablePermissions?: string[] | null;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setInternalOpen;
  const isEditing = Boolean(role);
  const isSuperAdmin = role?.id === "super-admin" || role?.name === "Super Admin";
  const isReadOnly = isSuperAdmin || Boolean(explicitReadOnly);

  const grantableSet = useMemo(
    () => (grantablePermissions ? new Set(grantablePermissions) : null),
    [grantablePermissions],
  );
  const canGrant = (key: string) => grantableSet === null || grantableSet.has(key);

  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(
    new Set(role?.permissions ?? []),
  );

  const action = isEditing ? updateRoleAction : createRoleAction;
  const [state, formAction, isPending] = useActionState<RoleFormState, FormData>(
    action,
    undefined,
  );

  // Reset form when dialog opens/closes or role changes
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setName(role?.name ?? "");
      setDescription(role?.description ?? "");
      setSelectedPermissions(new Set(role?.permissions ?? []));
    }
  }, [open, role]);

  useEffect(() => {
    if (state?.success) {
      toast.success(
        isEditing
          ? `Role "${name}" updated successfully.`
          : `Role "${name}" created successfully.`,
      );
      setOpen(false);
      onSaved?.();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, isEditing, name, onSaved, setOpen]);

  const setPermission = (key: string, enabled: boolean) => {
    if (!canGrant(key)) return;
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (enabled) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const toggleRow = (row: MatrixRow) => {
    const rowKeys = Object.values(row.actions)
      .map((a) => a.key)
      .filter(canGrant);
    if (rowKeys.length === 0) return;
    const allSelected = rowKeys.every((k) => selectedPermissions.has(k));

    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      for (const k of rowKeys) {
        if (allSelected) {
          next.delete(k);
        } else {
          next.add(k);
        }
      }
      return next;
    });
  };

  const selectAll = () => {
    const allKeys = matrix
      .flatMap((row) => Object.values(row.actions).map((a) => a.key))
      .filter(canGrant);
    setSelectedPermissions(new Set(allKeys));
  };

  const clearAll = () => {
    setSelectedPermissions(new Set());
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger render={trigger} />
      ) : controlledOpen === undefined ? (
        <DialogTrigger
          render={
            <Button size="sm" className="gap-1.5">
              <Plus className="size-4 shrink-0" />
              <span className="hidden sm:inline">Create role</span>
            </Button>
          }
        />
      ) : null}
      <DialogContent className="w-[95vw] sm:max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isSuperAdmin
              ? "Role: Super Admin"
              : isReadOnly
                ? `Role: ${role?.name}`
                : isEditing
                  ? `Edit Role: ${role?.name}`
                  : "Create Role"}
          </DialogTitle>
          <DialogDescription>
            {isSuperAdmin
              ? "Super Admin holds unrestricted access to all capabilities across all branches. Permissions are locked."
              : isReadOnly
                ? "View the permissions assigned to this role."
                : isEditing
                  ? "Modify the role name, description, and permissions matrix."
                  : "Define a new role with explicit resource and action permissions."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-6 pt-2">
          {isEditing && <input type="hidden" name="roleId" value={role?.id} />}

          {/* Hidden inputs to pass all selected permissions to server action */}
          {Array.from(selectedPermissions).map((permKey) => (
            <input key={permKey} type="hidden" name="permissions" value={permKey} />
          ))}

          {isSuperAdmin && (
            <Alert className="border-amber-500/20 bg-amber-500/5 text-foreground">
              <AlertDescription className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                Super Admin permissions are fixed and locked by the system. All capabilities are granted by default.
              </AlertDescription>
            </Alert>
          )}

          {!isSuperAdmin && !isReadOnly && grantableSet !== null && (
            <Alert className="border-border bg-muted/40 text-foreground">
              <AlertDescription className="flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="size-3.5 shrink-0 text-muted-foreground" />
                <span>
                  You can only grant permissions that your own account has access to. Permissions outside your access are locked.
                </span>
              </AlertDescription>
            </Alert>
          )}

          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="role-name">
                Role Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="role-name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. HR Manager, Branch Manager, Operations Lead"
                required
                disabled={isPending || isReadOnly}
              />
              {state?.fieldErrors?.name && (
                <p className="text-xs text-destructive">{state.fieldErrors.name}</p>
              )}
            </div>

            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="role-description">Description</Label>
              <Input
                id="role-description"
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary of duties and responsibilities"
                disabled={isPending || isReadOnly}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Permissions Matrix ({isSuperAdmin ? "All" : `${selectedPermissions.size}`} selected)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Check the actions this role is authorized to perform. Authorization is deny-by-default.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={selectAll}
                  disabled={isPending || isReadOnly}
                  className="h-8 text-xs gap-1"
                >
                  <CheckSquare className="size-3.5" />
                  Select All
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearAll}
                  disabled={isPending || isReadOnly}
                  className="h-8 text-xs gap-1"
                >
                  <Square className="size-3.5" />
                  Clear All
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="p-2.5 font-semibold text-foreground min-w-[200px]">Resource</th>
                    {MATRIX_ACTIONS.map((actionCol) => (
                      <th
                        key={actionCol.key}
                        className="p-2.5 font-semibold text-center text-foreground min-w-[68px]"
                      >
                        {actionCol.label}
                      </th>
                    ))}
                    <th className="p-2.5 text-center font-medium text-muted-foreground w-16">
                      Toggle
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {matrix.map((row) => {
                    const rowKeys = Object.values(row.actions).map((a) => a.key);
                    const grantableRowKeys = rowKeys.filter(canGrant);
                    const allInRowSelected =
                      grantableRowKeys.length > 0 && grantableRowKeys.every((k) => selectedPermissions.has(k));

                    return (
                      <tr key={row.resource} className="hover:bg-muted/30 transition-colors">
                        <td className="p-2.5 align-middle">
                          <span className="font-medium text-foreground block">
                            {row.resourceLabel}
                          </span>
                          {row.resourceDescription && (
                            <span className="text-[11px] text-muted-foreground block line-clamp-1">
                              {row.resourceDescription}
                            </span>
                          )}
                        </td>

                        {MATRIX_ACTIONS.map((actionCol) => {
                          const actionDef = row.actions[actionCol.key];
                          if (!actionDef) {
                            return (
                              <td
                                key={actionCol.key}
                                className="p-2.5 text-center align-middle bg-muted/15 text-muted-foreground/75 font-medium text-sm select-none"
                              >
                                —
                              </td>
                            );
                          }

                          const isChecked = isSuperAdmin ? true : selectedPermissions.has(actionDef.key);
                          const isLockedForActor = !isReadOnly && !canGrant(actionDef.key);
                          const cellDisabled = isReadOnly || isLockedForActor;

                          return (
                            <td
                              key={actionCol.key}
                              className={`p-2.5 text-center align-middle ${
                                cellDisabled
                                  ? "cursor-not-allowed bg-muted/20 opacity-60"
                                  : "cursor-pointer hover:bg-muted/40"
                              }`}
                              onClick={
                                cellDisabled
                                  ? undefined
                                  : (e) => {
                                      const target = e.target as HTMLElement;
                                      if (
                                        target.getAttribute("data-slot") === "checkbox" ||
                                        target.closest('[data-slot="checkbox"]')
                                      ) {
                                        return;
                                      }
                                      setPermission(actionDef.key, !isChecked);
                                    }
                              }
                              title={
                                isLockedForActor
                                  ? "Locked — you do not have access to this permission"
                                  : `${actionDef.label} ${row.resourceLabel}`
                              }
                            >
                              <div className="flex items-center justify-center">
                                <Checkbox
                                  id={actionDef.key}
                                  checked={isChecked}
                                  onCheckedChange={
                                    cellDisabled
                                      ? undefined
                                      : (checked) => {
                                          setPermission(actionDef.key, !!checked);
                                        }
                                  }
                                  disabled={isPending || cellDisabled}
                                  aria-label={`${actionDef.label} ${row.resourceLabel}`}
                                  className="size-[18px] border-[1.5px] border-foreground/45 bg-background shadow-2xs hover:border-foreground/75 data-checked:border-primary data-checked:bg-primary"
                                />
                              </div>
                            </td>
                          );
                        })}

                        <td className="p-2.5 text-center align-middle">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleRow(row)}
                            disabled={isPending || isReadOnly || grantableRowKeys.length === 0}
                            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                          >
                            {allInRowSelected ? "None" : "All"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter className="pt-2">
            {isReadOnly ? (
              <Button type="button" onClick={() => setOpen(false)}>
                Close
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending && <Loader2 className="size-4 animate-spin mr-1.5" />}
                  {isEditing ? "Save Changes" : "Create Role"}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
