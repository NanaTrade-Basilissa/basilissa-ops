"use client";

import Link from "next/link";
import { ArrowRight, Download, AlertTriangle } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
      <>
        <Link
          href={`/admin/attendance/${row.original.employeeId}/${row.original.date}`}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {row.original.employeeName ?? row.original.employeeId}
        </Link>
        {row.original.employeeCode && (
          <span className="block font-mono text-xs text-muted-foreground">{row.original.employeeCode}</span>
        )}
      </>
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

      return (
        <TableRowActions
          actions={[
            needsReview && {
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
            {
              id: "view",
              label: "View details",
              icon: ArrowRight,
              href: `/admin/attendance/${item.employeeId}/${item.date}`,
            },
          ]}
        />
      );
    },
  }),
]);

export function AttendanceTable({ days, date }: { days: AttendanceRow[]; date?: string }) {
  const exportDate = date || (days[0]?.date ?? new Date().toISOString().slice(0, 10));

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
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-sm text-muted-foreground">
          {days.length} {days.length === 1 ? "day on record" : "days on record"}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          className="gap-1.5"
        >
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>
      <DataTable columns={columns} data={days} />
    </div>
  );
}
