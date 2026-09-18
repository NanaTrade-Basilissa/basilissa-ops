"use client";

import { useMemo, useState } from "react";
import { Search, RotateCcw } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { updateShift } from "@/lib/modules/employees/actions";
import { ShiftDialog } from "@/components/admin/shift-dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { FilterBar } from "@/components/admin/filter-bar";

export type ShiftRow = {
  id: string;
  name: string;
  isActive: boolean;
  hoursLabel: string;
  overnight: boolean;
  breakLabel: string;
  branchLabel: string;
  assignmentCount: number;
  canEdit: boolean;
  branchId: string;
  startTime: string;
  endTime: string;
  unpaidBreakMinutes: number;
};

const columnHelper = createColumnHelper<typeof dataTableFeatures, ShiftRow>();

const columns = columnHelper.columns([
  columnHelper.display({
    id: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="font-medium text-foreground underline-offset-4 hover:underline">
          {row.original.name}
        </span>
        {!row.original.isActive && (
          <Badge variant="outline" className="text-xs">
            inactive
          </Badge>
        )}
      </div>
    ),
  }),
  columnHelper.display({
    id: "hours",
    header: "Hours",
    cell: ({ row }) => (
      <span className="text-sm font-medium">
        {row.original.hoursLabel}
        {row.original.overnight && (
          <span className="ml-1 text-xs text-muted-foreground font-normal">(overnight)</span>
        )}
      </span>
    ),
  }),
  columnHelper.accessor("breakLabel", {
    header: "Break",
    cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("branchLabel", {
    header: "Branch",
    cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("assignmentCount", {
    header: "In use",
    cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue()}</span>,
  }),
]);

export function ShiftsTable({
  shifts,
  branches,
  allowGlobal = true,
  actionSlot,
}: {
  shifts: ShiftRow[];
  branches: { id: string; name: string }[];
  allowGlobal?: boolean;
  actionSlot?: React.ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editingShift, setEditingShift] = useState<ShiftRow | null>(null);

  const filteredShifts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return shifts.filter((s) => {
      if (branchFilter !== "ALL" && s.branchId !== branchFilter) return false;
      if (statusFilter === "ACTIVE" && !s.isActive) return false;
      if (statusFilter === "INACTIVE" && s.isActive) return false;
      if (q) {
        const matchesName = s.name.toLowerCase().includes(q);
        const matchesBranch = s.branchLabel.toLowerCase().includes(q);
        if (!matchesName && !matchesBranch) return false;
      }
      return true;
    });
  }, [shifts, search, branchFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredShifts.length / pageSize));
  const paginatedShifts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredShifts.slice(start, start + pageSize);
  }, [filteredShifts, page, pageSize]);

  const hasFilters = search.trim() !== "" || branchFilter !== "ALL" || statusFilter !== "ALL";

  return (
    <div className="space-y-4">
      <FilterBar
        hasActiveFilters={hasFilters}
        search={
          <div className="relative w-full sm:w-64 md:w-72 shrink-0">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="shift-search"
              placeholder="Search shift name..."
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
            {branches.length > 1 && (
              <NativeSelect
                id="shift-branch-filter"
                value={branchFilter}
                onChange={(e) => {
                  setBranchFilter(e.target.value);
                  setPage(1);
                }}
                className="h-9 text-xs"
                containerClassName="w-full sm:w-fit sm:min-w-[140px] sm:shrink-0"
              >
                <option value="ALL">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </NativeSelect>
            )}

            <NativeSelect
              id="shift-status-filter"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 text-xs"
              containerClassName="w-full sm:w-fit sm:min-w-[120px] sm:shrink-0"
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
                  setBranchFilter("ALL");
                  setStatusFilter("ALL");
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
        data={paginatedShifts}
        onRowClick={(row) => {
          if (row.canEdit) {
            setEditingShift(row);
          }
        }}
      />

      <DataTablePagination
        page={page}
        totalPages={totalPages}
        total={filteredShifts.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(1);
        }}
      />

      {editingShift && (
        <ShiftDialog
          open={Boolean(editingShift)}
          onOpenChange={(open) => {
            if (!open) setEditingShift(null);
          }}
          action={updateShift.bind(null, editingShift.id)}
          branches={branches}
          allowGlobal={allowGlobal}
          submitLabel="Save changes"
          title="Edit shift"
          description="Changes affect future days only. Settled attendance keeps its original schedule."
          defaultValues={{
            name: editingShift.name,
            branchId: editingShift.branchId,
            startTime: editingShift.startTime,
            endTime: editingShift.endTime,
            unpaidBreakMinutes: editingShift.unpaidBreakMinutes,
            isActive: editingShift.isActive,
          }}
        />
      )}
    </div>
  );
}
