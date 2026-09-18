"use client";

import { useMemo, useState } from "react";
import { Download, AlertTriangle, Search, RotateCcw } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResolveExceptionDialog } from "@/components/admin/resolve-exception-dialog";
import { TableRowActions } from "@/components/admin/table-row-actions";

export type AttendanceRow = {
  id: string;
  employeeId: string;
  branchId?: string;
  date: string;
  employeeName: string | null;
  employeeCode: string | null;
  branchName: string;
  actualInLabel: string;
  actualOutLabel: string;
  workedLabel: string;
  overtimeLabel: string;
  calculatedOvertimeMinutes?: number;
  payableOvertimeMinutes?: number;
  lateMinutes: number;
  status: string;
  flags: string[];
  canWrite?: boolean;
};

const columnHelper = createColumnHelper<typeof dataTableFeatures, AttendanceRow>();

const columns = columnHelper.columns([
  columnHelper.display({
    id: "employee",
    header: "Employee",
    cell: ({ row }) => (
      <div>
        <span className="font-medium text-foreground underline-offset-4 hover:underline">
          {row.original.employeeName ?? row.original.employeeId}
        </span>
        {row.original.employeeCode && (
          <span className="block font-mono text-xs text-muted-foreground">{row.original.employeeCode}</span>
        )}
      </div>
    ),
  }),
  columnHelper.accessor("branchName", {
    header: "Branch",
    cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue()}</span>,
  }),
  columnHelper.display({
    id: "in",
    header: "In",
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.actualInLabel}
        {row.original.lateMinutes > 0 && (
          <Badge variant="outline" className="ml-2">
            {row.original.lateMinutes}m late
          </Badge>
        )}
      </span>
    ),
  }),
  columnHelper.accessor("actualOutLabel", {
    header: "Out",
    cell: (info) => <span className="text-sm">{info.getValue()}</span>,
  }),
  columnHelper.accessor("workedLabel", {
    header: "Worked",
    cell: (info) => <span className="text-sm">{info.getValue()}</span>,
  }),
  columnHelper.accessor("overtimeLabel", {
    header: "Overtime",
    cell: (info) => <span className="text-sm">{info.getValue()}</span>,
  }),
  columnHelper.display({
    id: "flags",
    header: "Needs attention",
    cell: ({ row }) =>
      row.original.status === "NEEDS_REVIEW" ? (
        <div className="flex flex-wrap gap-1">
          {row.original.flags.map((flag) => (
            <Badge key={flag} variant="outline" className="text-xs">
              {flag.toLowerCase().replace(/_/g, " ")}
            </Badge>
          ))}
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">-</span>
      ),
  }),
  columnHelper.display({
    id: "actions",
    header: () => <div className="text-right sr-only sm:not-sr-only">Actions</div>,
    cell: ({ row }) => {
      const item = row.original;
      const needsReview = item.status === "NEEDS_REVIEW" && Boolean(item.branchId) && item.canWrite !== false;

      if (!needsReview) return null;

      return (
        <TableRowActions
          actions={[
            {
              id: "review",
              label: "Review exception",
              icon: AlertTriangle,
              dialog: (props) => (
                <ResolveExceptionDialog
                  open={props.open}
                  onOpenChange={props.onOpenChange}
                  employeeId={item.employeeId}
                  employeeName={item.employeeName ?? "Staff Member"}
                  branchId={item.branchId!}
                  dateKey={item.date}
                  flags={item.flags}
                  calculatedOvertimeMinutes={item.calculatedOvertimeMinutes ?? 0}
                  payableOvertimeMinutes={item.payableOvertimeMinutes ?? 0}
                  canAuthorizeOvertime={true}
                />
              ),
            },
          ]}
        />
      );
    },
  }),
]);

export function AttendanceTable({ days, date }: { days: AttendanceRow[]; date?: string }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const exportDate = date || (days[0]?.date ?? new Date().toISOString().slice(0, 10));

  const filteredDays = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return days;
    return days.filter((d) => {
      const name = (d.employeeName ?? "").toLowerCase();
      const code = (d.employeeCode ?? "").toLowerCase();
      const branch = d.branchName.toLowerCase();
      return name.includes(q) || code.includes(q) || branch.includes(q);
    });
  }, [days, search]);

  const totalPages = Math.max(1, Math.ceil(filteredDays.length / pageSize));
  const paginatedDays = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredDays.slice(start, start + pageSize);
  }, [filteredDays, page, pageSize]);

  function handleExportCsv() {
    const headers = [
      "Employee Name",
      "Employee Code",
      "Branch",
      "Date",
      "Clock In",
      "Clock Out",
      "Hours Worked",
      "Overtime",
      "Late (min)",
      "Status",
      "Flags",
    ];
    const rows = days.map((day) => [
      `"${(day.employeeName ?? day.employeeId).replace(/"/g, '""')}"`,
      `"${(day.employeeCode ?? "").replace(/"/g, '""')}"`,
      `"${day.branchName.replace(/"/g, '""')}"`,
      `"${day.date}"`,
      `"${day.actualInLabel}"`,
      `"${day.actualOutLabel}"`,
      `"${day.workedLabel}"`,
      `"${day.overtimeLabel}"`,
      day.lateMinutes,
      `"${day.status}"`,
      `"${day.flags.join("; ")}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `attendance-${exportDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          <div className="relative w-full sm:w-64 md:w-72 shrink-0">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="attendance-search"
              placeholder="Search employee or branch..."
              className="pl-8 h-9 text-xs"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
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
              title="Reset search"
            >
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          )}

          <span className="text-xs text-muted-foreground hidden sm:inline">
            {filteredDays.length} {filteredDays.length === 1 ? "record" : "records"}
          </span>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          className="h-9 gap-1.5 text-xs shrink-0"
        >
          <Download className="size-3.5" />
          <span className="hidden sm:inline">Export CSV</span>
          <span className="sm:hidden">Export</span>
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={paginatedDays}
        getRowHref={(row) => `/admin/attendance/${row.employeeId}/${row.date}`}
      />

      <DataTablePagination
        page={page}
        totalPages={totalPages}
        total={filteredDays.length}
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
