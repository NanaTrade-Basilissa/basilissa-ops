"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, RotateCcw, Search, Trash2 } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { toast } from "sonner";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { StatusBadge } from "@/components/admin/status-badge";
import { TableRowActions, type TableRowActionItem } from "@/components/admin/table-row-actions";
import { softDeleteShiftAction, updateShift } from "@/lib/modules/employees/actions";
import { ShiftDialog } from "@/components/admin/shift-dialog";
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
  offOnPublicHolidays: boolean;
};

const columnHelper = createColumnHelper<typeof dataTableFeatures, ShiftRow>();

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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [editingShift, setEditingShift] = useState<ShiftRow | null>(null);
  const [deletingShift, setDeletingShift] = useState<ShiftRow | null>(null);

  function handleConfirmDelete() {
    if (!deletingShift) return;
    const target = deletingShift;
    startTransition(async () => {
      const res = await softDeleteShiftAction(target.id);
      if (res.ok) {
        toast.success(`Shift template "${target.name}" deleted.`);
        setDeletingShift(null);
        router.refresh();
      } else {
        toast.error(res.error || "Failed to delete shift template.");
      }
    });
  }

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.display({
          id: "name",
          header: "Name",
          cell: ({ row }) => (
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground underline-offset-4 hover:underline">
                {row.original.name}
              </span>
              {!row.original.isActive && <StatusBadge tone="neutral">Inactive</StatusBadge>}
            </div>
          ),
        }),
        columnHelper.display({
          id: "hours",
          header: "Hours",
          cell: ({ row }) => (
            <span className="text-sm font-medium tabular-nums">
              {row.original.hoursLabel}
              {row.original.overnight && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">(overnight)</span>
              )}
            </span>
          ),
        }),
        columnHelper.accessor("breakLabel", {
          header: "Break",
          cell: (info) => <span className="text-sm tabular-nums text-muted-foreground">{info.getValue()}</span>,
        }),
        columnHelper.accessor("branchLabel", {
          header: "Branch",
          cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue()}</span>,
        }),
        columnHelper.accessor("assignmentCount", {
          header: "In use",
          cell: (info) => <span className="text-sm tabular-nums text-muted-foreground">{info.getValue()}</span>,
        }),
        columnHelper.display({
          id: "actions",
          header: "",
          cell: ({ row }) => {
            const shift = row.original;
            if (!shift.canEdit) return null;
            const actions: TableRowActionItem[] = [
              {
                id: "edit",
                label: "Edit shift",
                icon: Pencil,
                onSelect: () => setEditingShift(shift),
              },
              ...(shift.assignmentCount === 0
                ? [
                    {
                      id: "delete",
                      label: "Delete template",
                      icon: Trash2,
                      variant: "destructive",
                      onSelect: () => setDeletingShift(shift),
                    } satisfies TableRowActionItem,
                  ]
                : []),
            ];
            return (
              <div className="flex justify-end">
                <TableRowActions actions={actions} />
              </div>
            );
          },
        }),
      ]),
    [],
  );

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
    <div className="space-y-3">
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
        alwaysShow={filteredShifts.length > 0}
      />

      <AlertDialog
        open={Boolean(deletingShift)}
        onOpenChange={(open) => {
          if (!open) setDeletingShift(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete shift template?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deletingShift?.name}&rdquo; will be removed from active templates. Existing historical records are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            offOnPublicHolidays: editingShift.offOnPublicHolidays,
            isActive: editingShift.isActive,
          }}
        />
      )}
    </div>
  );
}
