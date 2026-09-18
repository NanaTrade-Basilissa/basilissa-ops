"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckSquare, Loader2, Plus, Square } from "lucide-react";
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
}: {
  role?: FormattedCustomRole;
  matrix: MatrixRow[];
  trigger?: React.ReactElement;
  onSaved?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setInternalOpen;
  const isEditing = Boolean(role);

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
  }, [state, isEditing, name, onSaved]);

  const togglePermission = (key: string) => {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleRow = (row: MatrixRow) => {
    const rowKeys = Object.values(row.actions).map((a) => a.key);
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
    const allKeys = matrix.flatMap((row) => Object.values(row.actions).map((a) => a.key));
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
            <Button size="sm">
              <Plus className="size-4 mr-1.5" />
              Create role
            </Button>
          }
        />
      ) : null}
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Edit Role: ${role?.name}` : "Create Custom Role"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modify the role name, description, and permissions matrix."
              : "Define a new custom role with explicit resource and action permissions."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-6 pt-2">
          {isEditing && <input type="hidden" name="roleId" value={role?.id} />}

          {/* Hidden inputs to pass all selected permissions to server action */}
          {Array.from(selectedPermissions).map((permKey) => (
            <input key={permKey} type="hidden" name="permissions" value={permKey} />
          ))}

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
                disabled={isPending}
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
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Permissions Matrix ({selectedPermissions.size} selected)
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
                  disabled={isPending}
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
                  disabled={isPending}
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
                    <th className="p-2.5 font-semibold text-foreground min-w-[160px]">Resource</th>
                    {MATRIX_ACTIONS.map((actionCol) => (
                      <th
                        key={actionCol.key}
                        className="p-2.5 font-semibold text-center text-foreground min-w-[75px]"
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
                    const allInRowSelected =
                      rowKeys.length > 0 && rowKeys.every((k) => selectedPermissions.has(k));
                    const _someInRowSelected =
                      rowKeys.some((k) => selectedPermissions.has(k)) && !allInRowSelected;

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
                                className="p-2.5 text-center align-middle bg-muted/10 text-muted-foreground/30"
                              >
                                —
                              </td>
                            );
                          }

                          const isChecked = selectedPermissions.has(actionDef.key);

                          return (
                            <td
                              key={actionCol.key}
                              className="p-2.5 text-center align-middle cursor-pointer hover:bg-muted/40"
                              onClick={() => togglePermission(actionDef.key)}
                              title={`${actionDef.label} ${row.resourceLabel}`}
                            >
                              <div className="flex items-center justify-center">
                                <Checkbox
                                  id={actionDef.key}
                                  checked={isChecked}
                                  onCheckedChange={() => togglePermission(actionDef.key)}
                                  disabled={isPending}
                                  aria-label={`${actionDef.label} ${row.resourceLabel}`}
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
                            disabled={isPending}
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
