"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  Clock,
  Download,
  FileSpreadsheet,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatCard } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { TimesheetFilters } from "@/components/admin/timesheet-filters";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { EmployeeDetailSheet } from "@/components/admin/employee-detail-sheet";
import type { TimesheetSummaryData } from "@/lib/modules/attendance/queries";

function formatDuration(minutes: number): string {
  if (minutes === 0) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function formatLateDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
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

export function TimesheetsTable({
  data,
  branches,
  branchId,
  search,
}: {
  data: TimesheetSummaryData;
  branches: { id: string; name: string }[];
  branchId?: string;
  search?: string;
}) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  const {
    startDate,
    endDate,
    totalEmployees,
    totalRegularMinutes,
    totalPayableOvertimeMinutes,
    totalLateMinutes,
    totalExceptions,
    rows,
  } = data;

  const totalPayableMinutes = totalRegularMinutes + totalPayableOvertimeMinutes;

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
          label="Days"
          help="Days the employee clocked in, out of the days they were scheduled to work in this period."
        />
      ),
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">
          <span className="font-medium text-foreground">{row.original.daysWorked}</span>
          <span className="text-muted-foreground"> / {row.original.daysScheduled}</span>
        </span>
      ),
    }),
    columnHelper.accessor("regularMinutes", {
      header: () => (
        <ColumnHeader
          label="Regular Hours"
          help="Hours worked within scheduled shifts. Accounts for late arrivals and early departures; unscheduled late clock-outs do not add extra hours."
        />
      ),
      cell: (info) => <span className="text-sm tabular-nums text-foreground">{formatDuration(info.getValue())}</span>,
    }),
    columnHelper.accessor("payableOvertimeMinutes", {
      header: () => (
        <ColumnHeader
          label="Scheduled Overtime"
          help="Pre-scheduled or manager-approved overtime for payment. Unscheduled late clock-outs do not count as overtime."
        />
      ),
      cell: ({ row }) => {
        const { payableOvertimeMinutes } = row.original;
        if (payableOvertimeMinutes > 0) {
          return <StatusBadge tone="good">{formatDuration(payableOvertimeMinutes)}</StatusBadge>;
        }
        return <span className="text-muted-foreground">-</span>;
      },
    }),
    columnHelper.display({
      id: "late",
      header: () => (
        <ColumnHeader
          label="Late"
          help="Number of late clock-ins after the grace period, with total late time in brackets."
        />
      ),
      cell: ({ row }) =>
        row.original.lateCount > 0 ? (
          <StatusBadge
            tone="warning"
            title={`${row.original.lateCount} late occurrence${row.original.lateCount > 1 ? "s" : ""} totaling ${formatLateDuration(row.original.lateMinutes)}`}
          >
            {row.original.lateCount}x ({formatLateDuration(row.original.lateMinutes)})
          </StatusBadge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    }),
    columnHelper.display({
      id: "totalPayable",
      header: () => (
        <ColumnHeader
          label="Total Payable"
          help="Combined payable hours for this period: Regular Hours + Scheduled Overtime."
        />
      ),
      cell: ({ row }) => {
        const total = row.original.regularMinutes + row.original.payableOvertimeMinutes;
        return (
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatDuration(total)}
          </span>
        );
      },
    }),
    columnHelper.accessor("exceptionsCount", {
      header: () => (
        <ColumnHeader
          label="To Review"
          help="Days that cannot be finalised until a manager reviews them, such as a missing clock-out or overtime awaiting approval."
        />
      ),
      cell: (info) =>
        info.getValue() > 0 ? (
          <StatusBadge tone="critical">{info.getValue()} need review</StatusBadge>
        ) : (
          <span className="text-muted-foreground">-</span>
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
      "Regular Hours",
      "Scheduled Overtime Hours",
      "Total Payable Hours",
      "Late Days",
      "Total Late Time",
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
          formatHoursDecimal(r.regularMinutes),
          formatHoursDecimal(r.payableOvertimeMinutes),
          formatHoursDecimal(r.regularMinutes + r.payableOvertimeMinutes),
          r.lateCount,
          `"${formatLateDuration(r.lateMinutes)}"`,
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total staff" value={String(totalEmployees)} icon={Users} />
        <StatCard
          label="Regular hours"
          value={formatDuration(totalRegularMinutes)}
          icon={Clock}
        />
        <StatCard
          label="Scheduled overtime"
          value={formatDuration(totalPayableOvertimeMinutes)}
          icon={CalendarClock}
          tone="good"
        />
        <StatCard
          label="Total payable"
          value={formatDuration(totalPayableMinutes)}
          icon={Clock}
          tone="brand"
        />
        <StatCard
          label="Total late"
          value={formatLateDuration(totalLateMinutes)}
          icon={AlertTriangle}
        />
        <StatCard
          label="To review"
          value={String(totalExceptions)}
          icon={TriangleAlert}
        />
      </div>

      {/* Filter Bar directly above the table + unified Export menu */}
      <div className="space-y-3">
        <TimesheetFilters
          branches={branches}
          startDate={startDate}
          endDate={endDate}
          branchId={branchId}
          search={search}
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={rows.length === 0}
                    className="h-9 gap-1.5 text-xs"
                  >
                    <Download className="size-3.5" />
                    <span>Export</span>
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-max min-w-44">
                <DropdownMenuItem onClick={exportPayrollExcel} className="whitespace-nowrap">
                  <FileSpreadsheet className="size-4" />
                  Export Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportPayrollCsv} className="whitespace-nowrap">
                  <Download className="size-4" />
                  Export CSV (.csv)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />

        <DataTable
          columns={columns}
          data={rows}
          ariaLabel="Payroll timesheets"
          pageSize={20}
          emptyMessage="No attendance recorded for this period."
          onRowClick={(row) => setSelectedEmployeeId(row.employeeId)}
        />
      </div>
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
