"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Download,
  Users,
  Clock,
  AlertTriangle,
  TriangleAlert,
  CalendarClock,
  FileSpreadsheet,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatCard } from "@/components/admin/stat-card";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { EmployeeDetailSheet } from "@/components/admin/employee-detail-sheet";
import { TableRowActions } from "@/components/admin/table-row-actions";
import type { TimesheetSummaryData } from "@/lib/modules/attendance/queries";

function formatDuration(minutes: number): string {
  if (minutes === 0) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function formatHoursDecimal(minutes: number): string {
  return (minutes / 60).toFixed(2);
}

type TimesheetRow = TimesheetSummaryData["rows"][number];

/** A column title that explains itself on hover, since these figures become pay. */
function ColumnHeader({ label, help }: { label: string; help: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span />}
        className="cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-4"
      >
        {label}
      </TooltipTrigger>
      <TooltipContent>{help}</TooltipContent>
    </Tooltip>
  );
}

const columnHelper = createColumnHelper<typeof dataTableFeatures, TimesheetRow>();

export function TimesheetsTable({ data }: { data: TimesheetSummaryData }) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  const {
    startDate,
    endDate,
    totalEmployees,
    totalWorkedMinutes,
    totalRegularMinutes,
    totalOvertimeMinutes,
    totalPayableOvertimeMinutes,
    totalLateMinutes,
    totalExceptions,
    rows,
  } = data;

  const columns = columnHelper.columns([
    columnHelper.accessor("name", {
      header: () => <ColumnHeader label="Employee" help="Staff member and their employee code." />,
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <span className="font-medium text-foreground">{row.original.name}</span>
          {row.original.employeeCode && (
            <span className="block font-mono text-xs text-muted-foreground">
              {row.original.employeeCode}
            </span>
          )}
        </div>
      ),
    }),
    columnHelper.accessor("branchName", {
      header: () => (
        <ColumnHeader label="Branch" help="The branch the employee is assigned to for this period." />
      ),
      cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue()}</span>,
    }),
    columnHelper.display({
      id: "days",
      header: () => (
        <ColumnHeader
          label="Days Worked / Scheduled"
          help="Days the employee clocked in, out of the days they were scheduled to work in this period."
        />
      ),
      cell: ({ row }) => (
        <span className="text-sm">
          <span className="font-medium text-foreground">{row.original.daysWorked}</span>
          <span className="text-muted-foreground"> / {row.original.daysScheduled}</span>
        </span>
      ),
    }),
    columnHelper.accessor("netWorkedMinutes", {
      header: () => (
        <ColumnHeader
          label="Net Hours Worked"
          help="Total time between clock-in and clock-out, minus breaks. Includes any time worked beyond the shift."
        />
      ),
      cell: (info) => <span className="font-medium text-foreground">{formatDuration(info.getValue())}</span>,
    }),
    columnHelper.accessor("regularMinutes", {
      header: () => (
        <ColumnHeader
          label="Regular Hours"
          help="Hours worked within the scheduled shift. Never more than the shift length, so overtime is not included."
        />
      ),
      cell: (info) => <span className="text-muted-foreground">{formatDuration(info.getValue())}</span>,
    }),
    columnHelper.accessor("overtimeMinutes", {
      header: () => (
        <ColumnHeader
          label="Overtime"
          help="Time worked beyond the scheduled shift, once past the overtime threshold. This is what was worked, not what will be paid. Only Payable Overtime is paid."
        />
      ),
      cell: (info) =>
        info.getValue() > 0 ? (
          <span className="font-medium text-foreground">{formatDuration(info.getValue())}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    }),
    columnHelper.accessor("payableOvertimeMinutes", {
      header: () => (
        <ColumnHeader
          label="Payable Overtime"
          help="Overtime a manager has approved for payment. Overtime that is still waiting for approval is not paid and shows as Pending."
        />
      ),
      cell: ({ row }) => {
        const { overtimeMinutes, payableOvertimeMinutes } = row.original;
        if (payableOvertimeMinutes > 0) {
          return (
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              {formatDuration(payableOvertimeMinutes)}
            </Badge>
          );
        }
        if (overtimeMinutes > 0) {
          return (
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300">
              Pending
            </Badge>
          );
        }
        return <span className="text-muted-foreground">-</span>;
      },
    }),
    columnHelper.display({
      id: "late",
      header: () => (
        <ColumnHeader
          label="Late"
          help="Number of days the employee clocked in after the grace period, with the total minutes late in brackets."
        />
      ),
      cell: ({ row }) =>
        row.original.lateCount > 0 ? (
          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300">
            {row.original.lateCount}x ({row.original.lateMinutes}m)
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    }),
    columnHelper.accessor("exceptionsCount", {
      header: () => (
        <ColumnHeader
          label="Days to Review"
          help="Days that cannot be finalised until a manager reviews them, such as a missing clock-out or overtime awaiting approval."
        />
      ),
      cell: (info) =>
        info.getValue() > 0 ? (
          <Badge variant="destructive">{info.getValue()} need review</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    }),
    columnHelper.display({
      id: "actions",
      header: () => <div className="text-right sr-only sm:not-sr-only">Actions</div>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <TableRowActions
            actions={[
              {
                label: "Daily view",
                href: `/admin/attendance?branchId=${row.original.branchId}&date=${startDate}`,
                icon: Calendar,
              },
            ]}
          />
        </div>
      ),
    }),
  ]);

  function exportPayrollCsv() {
    const headers = [
      "Employee Code",
      "Employee Name",
      "Branch",
      "Period Start",
      "Period End",
      "Days Scheduled",
      "Days Worked",
      "Scheduled Hours",
      "Net Worked Hours",
      "Regular Hours",
      "Overtime Worked Hours",
      "Payable Overtime Hours",
      "Late Days",
      "Total Late Minutes",
      "Days To Review",
    ];

    const csvRows = [
      headers.join(","),
      ...rows.map((r) =>
        [
          `"${r.employeeCode ?? ""}"`,
          `"${r.name}"`,
          `"${r.branchName}"`,
          `"${startDate}"`,
          `"${endDate}"`,
          r.daysScheduled,
          r.daysWorked,
          formatHoursDecimal(r.scheduledMinutes),
          formatHoursDecimal(r.netWorkedMinutes),
          formatHoursDecimal(r.regularMinutes),
          formatHoursDecimal(r.overtimeMinutes),
          formatHoursDecimal(r.payableOvertimeMinutes),
          r.lateCount,
          r.lateMinutes,
          r.exceptionsCount,
        ].join(","),
      ),
    ];

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `payroll-timesheet-${startDate}-to-${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const searchParams = useSearchParams();

  function exportPayrollExcel() {
    const params = new URLSearchParams(searchParams ? searchParams.toString() : "");
    params.set("startDate", startDate);
    params.set("endDate", endDate);
    const link = document.createElement("a");
    link.href = `/api/admin/attendance/export/excel?${params.toString()}`;
    link.setAttribute("download", `payroll-timesheet-${startDate}-to-${endDate}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="space-y-6">
      {/* Summary Stat Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <StatCard label="Total staff" value={String(totalEmployees)} icon={Users} />
        <StatCard
          label="Net worked"
          value={formatDuration(totalWorkedMinutes)}
          icon={Clock}
        />
        <StatCard
          label="Regular"
          value={formatDuration(totalRegularMinutes)}
          icon={Clock}
        />
        <StatCard
          label="Overtime"
          value={formatDuration(totalOvertimeMinutes)}
          icon={CalendarClock}
        />
        <StatCard
          label="Payable overtime"
          value={formatDuration(totalPayableOvertimeMinutes)}
          icon={CalendarClock}
          tone="good"
        />
        <StatCard
          label="Total late"
          value={formatDuration(totalLateMinutes)}
          icon={AlertTriangle}
        />
        <StatCard
          label="Days to review"
          value={String(totalExceptions)}
          icon={TriangleAlert}
        />
      </div>

      {/* Header with Export CTA */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          Showing <span className="font-medium text-foreground">{rows.length}</span> employees for{" "}
          <span className="font-medium text-foreground">{startDate}</span> to{" "}
          <span className="font-medium text-foreground">{endDate}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportPayrollCsv}
            disabled={rows.length === 0}
            className="gap-1.5 text-xs"
          >
            <Download className="size-3.5" />
            CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportPayrollExcel}
            disabled={rows.length === 0}
            className="gap-1.5 text-xs border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            <FileSpreadsheet className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            Export Excel (.xlsx)
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        emptyMessage="No attendance recorded for this period."
        onRowClick={(row) => setSelectedEmployeeId(row.employeeId)}
      />
      <EmployeeDetailSheet
        employeeId={selectedEmployeeId}
        open={selectedEmployeeId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedEmployeeId(null);
        }}
      />
    </div>
  );
}
