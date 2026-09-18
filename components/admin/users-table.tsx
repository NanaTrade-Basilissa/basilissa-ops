"use client";

import { useMemo, useState } from "react";
import { ShieldCheck, Search, RotateCcw } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { UserDetailSheet } from "@/components/admin/user-detail-sheet";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { formatAccraDateTime } from "@/lib/platform/date";
import { FilterBar } from "@/components/admin/filter-bar";

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

const columns = columnHelper.columns([
  columnHelper.display({
    id: "name",
    header: "Name",
    cell: ({ row }) => (
      <div>
        <span className="font-medium text-foreground underline-offset-4 hover:underline">
          {row.original.name}
        </span>
        <span className="block text-xs text-muted-foreground">{row.original.email}</span>
        {row.original.status !== "ACTIVE" && (
          <Badge variant="destructive" className="mt-1 text-xs">
            {row.original.status.toLowerCase()}
          </Badge>
        )}
      </div>
    ),
  }),
  columnHelper.display({
    id: "roles",
    header: "Roles",
    cell: ({ row }) => {
      const customRole = row.original.customRoleName;
      const roles = row.original.roles;

      const allRoles: { label: string; variant: "secondary" | "outline" }[] = [];

      if (customRole) {
        allRoles.push({ label: customRole, variant: "secondary" });
      }

      for (const a of roles) {
        const branchSuffix = a.scopeType === "BRANCH" ? ` · ${a.branchName ?? "branch"}` : "";
        allRoles.push({
          label: `${a.role.toLowerCase().replace(/_/g, " ")}${branchSuffix}`,
          variant: "outline",
        });
      }

      if (allRoles.length === 0) {
        return <span className="text-sm text-muted-foreground">None</span>;
      }

      const firstRole = allRoles[0];
      const extraCount = allRoles.length - 1;

      return (
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <Badge variant={firstRole.variant} className="text-xs">
            {firstRole.label}
          </Badge>
          {extraCount > 0 && (
            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
              +{extraCount}
            </Badge>
          )}
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
]);

export function UsersTable({
  users,
  canWrite: _canWrite,
  isSuperAdminViewer = false,
  actionSlot,
}: {
  users: UserRow[];
  canWrite: boolean;
  isSuperAdminViewer?: boolean;
  actionSlot?: React.ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const visibleUsers = useMemo(() => {
    if (isSuperAdminViewer) return users;
    return users.filter(
      (u) => !u.isSuperAdmin && !u.roles.some((r) => r.role === "SUPER_ADMIN"),
    );
  }, [users, isSuperAdminViewer]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleUsers.filter((u) => {
      if (status !== "ALL" && u.status !== status) return false;
      if (q) {
        const matchesName = u.name.toLowerCase().includes(q);
        const matchesEmail = u.email.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail) return false;
      }
      return true;
    });
  }, [visibleUsers, search, status]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, page, pageSize]);

  const hasFilters = search.trim() !== "" || status !== "ALL";

  return (
    <div className="space-y-4">
      <FilterBar
        hasActiveFilters={hasFilters}
        search={
          <div className="relative w-full sm:w-64 md:w-72 shrink-0">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="user-search"
              placeholder="Search user by name or email..."
              className="pl-8 h-9 text-xs"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        }
        filters={
          <>
            <NativeSelect
              id="user-status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="h-9 text-xs"
              containerClassName="w-full sm:w-fit sm:min-w-[130px] sm:shrink-0"
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="TERMINATED">Terminated</option>
            </NativeSelect>

            {hasFilters && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatus("ALL");
                  setPage(1);
                }}
                className="h-9 gap-1.5 text-xs"
                title="Reset filters"
              >
                <RotateCcw className="size-3.5" />
                Reset
              </Button>
            )}
          </>
        }
        actions={actionSlot}
      />

      <DataTable
        columns={columns}
        data={paginatedUsers}
        onRowClick={(row) => setSelectedUserId(row.id)}
      />

      <DataTablePagination
        page={page}
        totalPages={totalPages}
        total={filteredUsers.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(1);
        }}
      />

      <UserDetailSheet
        userId={selectedUserId}
        open={Boolean(selectedUserId)}
        onOpenChange={(open) => {
          if (!open) setSelectedUserId(null);
        }}
      />
    </div>
  );
}
