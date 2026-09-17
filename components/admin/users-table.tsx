"use client";

import { useMemo } from "react";
import { ShieldCheck } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { UserDetailSheet } from "@/components/admin/user-detail-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatAccraDateTime } from "@/lib/platform/date";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  lastLoginAt: Date | null;
  mfaEnabledAt: Date | null;
  recoveryCodesLeft: number;
  requiresMfa: boolean;
  recommendsMfa?: boolean;
  isSuperAdmin?: boolean;
  roles: { role: string; scopeType: string; branchName: string | null }[];
  customRoleName?: string | null;
};

const columnHelper = createColumnHelper<typeof dataTableFeatures, UserRow>();

export function UsersTable({
  users,
  canWrite,
  isSuperAdminViewer = false,
}: {
  users: UserRow[];
  canWrite: boolean;
  isSuperAdminViewer?: boolean;
}) {
  const visibleUsers = useMemo(() => {
    if (isSuperAdminViewer) return users;
    return users.filter(
      (u) => !u.isSuperAdmin && !u.roles.some((r) => r.role === "SUPER_ADMIN"),
    );
  }, [users, isSuperAdminViewer]);

  const columns = useMemo(() => columnHelper.columns([
    columnHelper.display({
      id: "name",
      header: "Name",
      cell: ({ row }) => (
        <>
          <UserDetailSheet
            userId={row.original.id}
            trigger={
              <button type="button" className="font-medium underline-offset-4 hover:underline">
                {row.original.name}
              </button>
            }
          />
          <span className="block text-xs text-muted-foreground">{row.original.email}</span>
          {row.original.status !== "ACTIVE" && (
            <Badge variant="destructive" className="mt-1 text-xs">
              {row.original.status.toLowerCase()}
            </Badge>
          )}
        </>
      ),
    }),
    columnHelper.display({
      id: "roles",
      header: "Roles",
      cell: ({ row }) => {
        const hasSystemRoles = row.original.roles.length > 0;
        const customRole = row.original.customRoleName;

        if (!hasSystemRoles && !customRole) {
          return <span className="text-sm text-muted-foreground">None</span>;
        }

        return (
          <div className="flex flex-wrap gap-1">
            {customRole && (
              <Badge variant="secondary" className="text-xs font-medium">
                {customRole}
              </Badge>
            )}
            {row.original.roles.map((assignment, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {assignment.role.toLowerCase().replace(/_/g, " ")}
                {assignment.scopeType === "BRANCH" && ` · ${assignment.branchName ?? "branch"}`}
              </Badge>
            ))}
          </div>
        );
      },
    }),
    columnHelper.display({
      id: "mfa",
      header: "Two-step",
      cell: ({ row }) =>
        row.original.mfaEnabledAt ? (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <ShieldCheck className="size-4" />
            on
            <span className="text-xs text-muted-foreground">({row.original.recoveryCodesLeft} codes left)</span>
          </span>
        ) : row.original.requiresMfa ? (
          <Badge variant="destructive">required, not set up</Badge>
        ) : row.original.recommendsMfa ? (
          <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400">
            optional
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">off</span>
        ),
    }),
    columnHelper.accessor("lastLoginAt", {
      header: "Last signed in",
      cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue() ? formatAccraDateTime(info.getValue()!) : "Never"}</span>,
    }),
    ...(canWrite
      ? [
          columnHelper.display({
            id: "actions",
            header: () => <span className="sr-only">Actions</span>,
            cell: ({ row }) => (
              <UserDetailSheet
                userId={row.original.id}
                trigger={
                  <Button variant="ghost" size="sm">
                    Manage
                  </Button>
                }
              />
            ),
          }),
        ]
      : []),
  ]), [canWrite]);

  return <DataTable columns={columns} data={visibleUsers} />;
}
