"use client";

import { useMemo } from "react";
import { Edit2, Shield, Trash2, Users, Calendar } from "lucide-react";
import type { FormattedCustomRole } from "@/lib/modules/identity/constants";
import type { MatrixRow } from "@/lib/modules/identity/authorization";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RoleDialog } from "@/components/admin/role-dialog";
import { DeleteRoleDialog } from "@/components/admin/delete-role-dialog";
import { formatAccraDateTime } from "@/lib/platform/date";

export function RoleDetailSheet({
  role,
  matrix,
  canUpdate = false,
  canDelete = false,
  open,
  onOpenChange,
}: {
  role: FormattedCustomRole | null;
  matrix: MatrixRow[];
  canUpdate?: boolean;
  canDelete?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Group permissions by prefix (e.g., "attendance", "employee", "feedback")
  const groupedPermissions = useMemo(() => {
    if (!role) return {};
    const groups: Record<string, string[]> = {};
    for (const perm of role.permissions) {
      const [prefix, action] = perm.split(":");
      const groupKey = prefix ? prefix.charAt(0).toUpperCase() + prefix.slice(1) : "Other";
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(action ? `${action}` : perm);
    }
    return groups;
  }, [role]);

  if (!role) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md lg:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Shield className="size-5" />
            </div>
            <div>
              <SheetTitle className="text-lg font-bold">{role.name}</SheetTitle>
              <SheetDescription className="text-xs">
                {role.description || "Custom permission role"}
              </SheetDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Badge variant={role.userCount > 0 ? "secondary" : "outline"} className="gap-1 text-xs">
              <Users className="size-3.5" />
              {role.userCount} {role.userCount === 1 ? "assigned user" : "assigned users"}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {role.permissionCount} {role.permissionCount === 1 ? "permission" : "permissions"}
            </Badge>
          </div>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Metadata */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Calendar className="size-3.5" /> Created on
              </span>
              <span className="font-medium text-foreground">
                {formatAccraDateTime(role.createdAt)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Scope type</span>
              <span className="font-mono font-medium text-foreground">System Custom Role</span>
            </div>
          </div>

          {/* Permissions Breakdown */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Granted Permissions</h3>
              <span className="text-xs text-muted-foreground">
                {role.permissions.length} total
              </span>
            </div>

            {Object.keys(groupedPermissions).length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No active permissions assigned to this role.
              </p>
            ) : (
              <div className="space-y-3">
                {Object.entries(groupedPermissions).map(([group, actions]) => (
                  <div key={group} className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">{group}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {actions.length} {actions.length === 1 ? "action" : "actions"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {actions.map((act) => (
                        <Badge
                          key={act}
                          variant="secondary"
                          className="font-mono text-[11px] px-2 py-0.5"
                        >
                          {act}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          {(canUpdate || canDelete) && (
            <div className="pt-4 border-t border-border flex items-center justify-end gap-2">
              {canDelete && (
                <DeleteRoleDialog
                  role={{ id: role.id, name: role.name, userCount: role.userCount }}
                  trigger={
                    <Button variant="destructive" size="sm" className="gap-1.5 text-xs">
                      <Trash2 className="size-3.5" />
                      Delete
                    </Button>
                  }
                />
              )}
              {canUpdate && (
                <RoleDialog
                  role={role}
                  matrix={matrix}
                  trigger={
                    <Button variant="default" size="sm" className="gap-1.5 text-xs">
                      <Edit2 className="size-3.5" />
                      Edit Role
                    </Button>
                  }
                />
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
