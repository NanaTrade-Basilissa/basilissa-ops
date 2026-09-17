"use client";

import { useState } from "react";
import { Edit2, Shield, Users, ChevronDown, ChevronRight } from "lucide-react";
import type { FormattedCustomRole } from "@/lib/modules/identity/constants";
import type { MatrixRow } from "@/lib/modules/identity/authorization";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RoleDialog } from "@/components/admin/role-dialog";
import { DeleteRoleDialog } from "@/components/admin/delete-role-dialog";
import { formatAccraDateTime } from "@/lib/platform/date";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export function RolesTable({
  roles,
  matrix,
  canCreate,
  canUpdate,
  canDelete,
}: {
  roles: FormattedCustomRole[];
  matrix: MatrixRow[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const [expandedRoleIds, setExpandedRoleIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (roles.length === 0) {
    return (
      <Empty className="border border-dashed rounded-xl p-8 text-center">
        <EmptyHeader>
          <EmptyMedia>
            <Shield className="size-10 text-muted-foreground mx-auto" />
          </EmptyMedia>
          <EmptyTitle>No custom roles created</EmptyTitle>
          <EmptyDescription>
            Super Admin can create custom roles with tailored resource and action permissions.
          </EmptyDescription>
        </EmptyHeader>
        {canCreate && (
          <EmptyContent className="mt-4">
            <RoleDialog matrix={matrix} />
          </EmptyContent>
        )}
      </Empty>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <th className="py-3 px-4 w-8"></th>
              <th className="py-3 px-4">Role</th>
              <th className="py-3 px-4">Description</th>
              <th className="py-3 px-4 text-center">Assigned Users</th>
              <th className="py-3 px-4 text-center">Permissions</th>
              <th className="py-3 px-4">Created</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {roles.map((role) => {
              const isExpanded = expandedRoleIds.has(role.id);

              return (
                <tr key={role.id} className="hover:bg-muted/20 transition-colors group">
                  <td className="py-3.5 px-4 text-center">
                    {role.permissions.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(role.id)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Toggle permission details"
                      >
                        {isExpanded ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </button>
                    )}
                  </td>
                  <td className="py-3.5 px-4 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      <Shield className="size-4 text-primary shrink-0" />
                      <span>{role.name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-muted-foreground max-w-xs truncate">
                    {role.description || <span className="italic text-muted-foreground/60">—</span>}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <Badge variant={role.userCount > 0 ? "secondary" : "outline"} className="gap-1 font-normal">
                      <Users className="size-3.5" />
                      {role.userCount} {role.userCount === 1 ? "user" : "users"}
                    </Badge>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <Badge variant="outline" className="font-normal">
                      {role.permissionCount} {role.permissionCount === 1 ? "permission" : "permissions"}
                    </Badge>
                  </td>
                  <td className="py-3.5 px-4 text-xs text-muted-foreground whitespace-nowrap">
                    {formatAccraDateTime(role.createdAt)}
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      {canUpdate && (
                        <RoleDialog
                          role={role}
                          matrix={matrix}
                          trigger={
                            <Button variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground hover:text-foreground">
                              <Edit2 className="size-3.5" />
                              Edit
                            </Button>
                          }
                        />
                      )}
                      {canDelete && (
                        <DeleteRoleDialog
                          role={{ id: role.id, name: role.name, userCount: role.userCount }}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Expandable details showing active permissions by role */}
      {roles.map((role) => {
        if (!expandedRoleIds.has(role.id)) return null;

        return (
          <div key={`exp-${role.id}`} className="bg-muted/10 border-t border-border px-6 py-4">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
              Permissions for {role.name} ({role.permissions.length}):
            </h4>
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
              {role.permissions.map((perm) => (
                <Badge key={perm} variant="secondary" className="text-xs font-mono">
                  {perm}
                </Badge>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
