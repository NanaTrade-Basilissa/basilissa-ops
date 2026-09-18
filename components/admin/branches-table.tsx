"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { toggleBranchActive, updateBranch } from "@/lib/modules/branches/actions";
import { BranchDialog } from "@/components/admin/branch-dialog";
import { Badge } from "@/components/ui/badge";
import { Edit2, Ban, CheckCircle2, Search, RotateCcw } from "lucide-react";
import { TableRowActions } from "@/components/admin/table-row-actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { FilterBar } from "@/components/admin/filter-bar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type BranchRow = {
  id: string;
  name: string;
  slug: string;
  location: string;
  isActive: boolean;
  latitude?: number | null;
  longitude?: number | null;
  geofenceRadiusMeters?: number;
  geofenceEnabled?: boolean;
  canWrite?: boolean;
  _count: { employees: number };
  avgScore: number | null;
};

const columnHelper = createColumnHelper<typeof dataTableFeatures, BranchRow>();

const columns = columnHelper.columns([
  columnHelper.accessor("name", {
    header: "Branch",
    cell: (info) => (
      <div>
        <Link
          href={`/admin/branches/${info.row.original.id}`}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {info.getValue()}
        </Link>
        <p className="text-xs text-muted-foreground">{info.row.original.location}</p>
      </div>
    ),
  }),
  columnHelper.accessor("isActive", {
    header: "Status",
    cell: (info) => <Badge variant={info.getValue() ? "default" : "outline"}>{info.getValue() ? "Active" : "Inactive"}</Badge>,
  }),
  columnHelper.accessor("geofenceEnabled", {
    header: "Geofence",
    cell: ({ row }) => {
      const { geofenceEnabled, latitude, longitude, geofenceRadiusMeters } = row.original;
      if (geofenceEnabled) {
        return (
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium">
            {geofenceRadiusMeters ?? 150}m Enforced
          </Badge>
        );
      }
      if (latitude != null && longitude != null) {
        return (
          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 text-xs">
            Disabled
          </Badge>
        );
      }
      return <span className="text-xs text-muted-foreground">—</span>;
    },
  }),
  columnHelper.accessor((row) => row._count.employees, {
    id: "employees",
    header: () => <div className="text-right">Employees</div>,
    cell: (info) => <div className="text-right">{info.getValue()}</div>,
  }),
  columnHelper.accessor("avgScore", {
    header: () => <div className="text-right">Avg score</div>,
    cell: (info) => <div className="text-right">{info.getValue() != null ? info.getValue()!.toFixed(1) : "-"}</div>,
  }),
  columnHelper.display({
    id: "actions",
    header: () => <div className="text-right sr-only sm:not-sr-only">Actions</div>,
    cell: ({ row }) => {
      const branch = row.original;
      const canWrite = branch.canWrite !== false;

      return (
        <TableRowActions
          actions={[
            canWrite && {
              id: "edit",
              label: "Edit branch",
              icon: Edit2,
              dialog: (props) => (
                <BranchDialog
                  open={props.open}
                  onOpenChange={props.onOpenChange}
                  action={updateBranch.bind(null, branch.id)}
                  submitLabel="Save changes"
                  title="Edit branch"
                  description="Changing the slug also changes this branch's QR code link."
                  defaultValues={{
                    name: branch.name,
                    slug: branch.slug,
                    location: branch.location,
                    isActive: branch.isActive,
                    latitude: branch.latitude,
                    longitude: branch.longitude,
                    geofenceRadiusMeters: branch.geofenceRadiusMeters,
                    geofenceEnabled: branch.geofenceEnabled,
                  }}
                />
              ),
            },
            canWrite && branch.isActive && {
              id: "deactivate",
              label: "Deactivate",
              icon: Ban,
              variant: "destructive",
              dialog: (props) => (
                <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Deactivate {branch.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This branch will immediately stop accepting new feedback submissions and will be marked inactive.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <form action={toggleBranchActive}>
                        <input type="hidden" name="id" value={branch.id} />
                        <input type="hidden" name="nextIsActive" value="false" />
                        <AlertDialogAction
                          type="submit"
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Deactivate branch
                        </AlertDialogAction>
                      </form>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ),
            },
            canWrite && !branch.isActive && {
              id: "activate",
              label: "Activate",
              icon: CheckCircle2,
              onClick: async () => {
                const formData = new FormData();
                formData.append("id", branch.id);
                formData.append("nextIsActive", "true");
                await toggleBranchActive(formData);
              },
            },
          ]}
        />
      );
    },
  }),
]);

export function BranchesTable({
  branches,
  actionSlot,
}: {
  branches: BranchRow[];
  actionSlot?: React.ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filteredBranches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return branches.filter((b) => {
      if (status === "ACTIVE" && !b.isActive) return false;
      if (status === "INACTIVE" && b.isActive) return false;
      if (q) {
        const matchesName = b.name.toLowerCase().includes(q);
        const matchesLocation = b.location.toLowerCase().includes(q);
        const matchesSlug = b.slug.toLowerCase().includes(q);
        if (!matchesName && !matchesLocation && !matchesSlug) return false;
      }
      return true;
    });
  }, [branches, search, status]);

  const totalPages = Math.max(1, Math.ceil(filteredBranches.length / pageSize));
  const paginatedBranches = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredBranches.slice(start, start + pageSize);
  }, [filteredBranches, page, pageSize]);

  const hasFilters = search.trim() !== "" || status !== "ALL";

  return (
    <div className="space-y-4">
      <FilterBar
        hasActiveFilters={hasFilters}
        search={
          <div className="relative w-full sm:w-64 md:w-72 shrink-0">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="branch-search"
              placeholder="Search branch name, location..."
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
              id="branch-status"
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
              <option value="INACTIVE">Inactive</option>
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
        data={paginatedBranches}
        getRowHref={(row) => `/admin/branches/${row.id}`}
      />

      <DataTablePagination
        page={page}
        totalPages={totalPages}
        total={filteredBranches.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(1);
        }}
      />
    </div>
  );
}
