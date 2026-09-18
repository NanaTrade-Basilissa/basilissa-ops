"use client";

import { useMemo, useState } from "react";
import { Edit2, RotateCcw, Search, Shield, Trash2, Users } from "lucide-react";
import type { FormattedCustomRole } from "@/lib/modules/identity/constants";
import type { MatrixRow } from "@/lib/modules/identity/authorization";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableRowActions } from "@/components/admin/table-row-actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RoleDialog } from "@/components/admin/role-dialog";
import { DeleteRoleDialog } from "@/components/admin/delete-role-dialog";
import { RoleDetailSheet } from "@/components/admin/role-detail-sheet";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { formatAccraDateTime } from "@/lib/platform/date";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

const PAGE_SIZE = 10;

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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedRole, setSelectedRole] = useState<FormattedCustomRole | null>(null);

  const filteredRoles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q)),
    );
  }, [roles, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRoles.length / PAGE_SIZE));
  const paginatedRoles = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRoles.slice(start, start + PAGE_SIZE);
  }, [filteredRoles, page]);

  const handleRowClick = (role: FormattedCustomRole) => {
    setSelectedRole(role);
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
    <div className="space-y-4">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
          <div className="relative w-full sm:w-64 md:w-72 shrink-0">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search roles..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-8 h-9 text-xs"
            />
          </div>

          {search && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setPage(1);
              }}
              className="h-9 gap-1.5 text-xs"
            >
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          )}
        </div>

        {canCreate && (
          <div className="shrink-0">
            <RoleDialog matrix={matrix} />
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Role</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-center">Assigned Users</TableHead>
              <TableHead className="text-center">Permissions</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right sr-only sm:not-sr-only">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedRoles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                  No roles match your search.
                </TableCell>
              </TableRow>
            ) : (
              paginatedRoles.map((role) => (
                <TableRow
                  key={role.id}
                  onClick={() => handleRowClick(role)}
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                >
                  <TableCell className="font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      <Shield className="size-4 text-primary shrink-0" />
                      <span className="font-medium underline-offset-4 hover:underline">
                        {role.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-xs truncate text-xs">
                    {role.description || <span className="italic text-muted-foreground/60">—</span>}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={role.userCount > 0 ? "secondary" : "outline"} className="gap-1 font-normal text-xs">
                      <Users className="size-3.5" />
                      {role.userCount} {role.userCount === 1 ? "user" : "users"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="font-normal text-xs">
                      {role.permissionCount} {role.permissionCount === 1 ? "permission" : "permissions"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatAccraDateTime(role.createdAt)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
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
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <DataTablePagination
        page={page}
        totalPages={totalPages}
        total={filteredRoles.length}
        pageSize={PAGE_SIZE}
        onPageChange={(newPage) => setPage(newPage)}
      />

      {/* Role Detail Sheet */}
      <RoleDetailSheet
        role={selectedRole}
        matrix={matrix}
        canUpdate={canUpdate}
        canDelete={canDelete}
        open={selectedRole !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedRole(null);
        }}
      />
    </div>
  );
}
