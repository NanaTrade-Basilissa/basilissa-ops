"use client";

import { useState } from "react";
import { Edit2, Shield, Users, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import type { FormattedCustomRole } from "@/lib/modules/identity/constants";
import type { MatrixRow } from "@/lib/modules/identity/authorization";
import { Badge } from "@/components/ui/badge";
import { TableRowActions } from "@/components/admin/table-row-actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
      <Empty className="border-0 py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Shield className="size-4" />
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
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8 text-center" />
            <TableHead>Role</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-center">Assigned Users</TableHead>
            <TableHead className="text-center">Permissions</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right sr-only sm:not-sr-only">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => {
            const isExpanded = expandedRoleIds.has(role.id);

            return (
              <TableRow key={role.id} className="transition-colors">
                <TableCell className="text-center">
                  {role.permissions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(role.id)}
                      className="text-muted-foreground hover:text-foreground cursor-pointer"
                      aria-label="Toggle permission details"
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </button>
                  )}
                </TableCell>
                <TableCell className="font-medium text-foreground">
                  <div className="flex items-center gap-2">
                    <Shield className="size-4 text-primary shrink-0" />
                    <span>{role.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground max-w-xs truncate">
                  {role.description || <span className="italic text-muted-foreground/60">—</span>}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={role.userCount > 0 ? "secondary" : "outline"} className="gap-1 font-normal">
                    <Users className="size-3.5" />
                    {role.userCount} {role.userCount === 1 ? "user" : "users"}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className="font-normal">
                    {role.permissionCount} {role.permissionCount === 1 ? "permission" : "permissions"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatAccraDateTime(role.createdAt)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <TableRowActions
                    actions={[
                      canUpdate && {
                        id: "edit",
                        label: "Edit role",
                        icon: Edit2,
                        dialog: (props) => (
                          <RoleDialog
                            open={props.open}
                            onOpenChange={props.onOpenChange}
                            role={role}
                            matrix={matrix}
                          />
                        ),
                      },
                      canDelete && {
                        id: "delete",
                        label: "Delete role",
                        icon: Trash2,
                        variant: "destructive",
                        dialog: (props) => (
                          <DeleteRoleDialog
                            open={props.open}
                            onOpenChange={props.onOpenChange}
                            role={{ id: role.id, name: role.name, userCount: role.userCount }}
                          />
                        ),
                      },
                    ]}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Expandable details showing active permissions by role */}
      {roles.map((role) => {
        if (!expandedRoleIds.has(role.id)) return null;

        return (
          <div key={`exp-${role.id}`} className="bg-muted/30 border-t border-border px-6 py-4">
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
