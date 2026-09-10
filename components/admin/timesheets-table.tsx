"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download, Users, Clock, AlertTriangle, TriangleAlert, CalendarClock, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/admin/stat-card";
import { Empty, EmptyDescription } from "@/components/ui/empty";
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

export function TimesheetsTable({ data }: { data: TimesheetSummaryData }) {
  const {
    startDate,
    endDate,
    totalEmployees,
    totalWorkedMinutes,
    totalRegularMinutes,
    totalOvertimeMinutes,
    totalLateMinutes,
    totalExceptions,
    rows,
  } = data;

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
      "Overtime Hours",
      "Late Occurrences",
      "Total Late Minutes",
      "Unresolved Exceptions",
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
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
          label="Total late"
          value={formatDuration(totalLateMinutes)}
          icon={AlertTriangle}
        />
        <StatCard
          label="Exceptions"
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

      {/* Table */}
      {rows.length === 0 ? (
        <Empty className="border">
          <EmptyDescription>No attendance recorded for this period.</EmptyDescription>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3 text-center">Days (Work/Sched)</th>
                  <th className="px-4 py-3 text-right">Net Worked</th>
                  <th className="px-4 py-3 text-right">Regular</th>
                  <th className="px-4 py-3 text-right">Overtime</th>
                  <th className="px-4 py-3 text-center">Late</th>
                  <th className="px-4 py-3 text-center">Exceptions</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.employeeId} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/employees/${row.employeeId}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {row.name}
                      </Link>
                      {row.employeeCode && (
                        <div className="font-mono text-xs text-muted-foreground">
                          {row.employeeCode}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.branchName}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-medium text-foreground">{row.daysWorked}</span>
                      <span className="text-muted-foreground"> / {row.daysScheduled}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      {formatDuration(row.netWorkedMinutes)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatDuration(row.regularMinutes)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.overtimeMinutes > 0 ? (
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                          +{formatDuration(row.overtimeMinutes)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.lateCount > 0 ? (
                        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300">
                          {row.lateCount}x ({row.lateMinutes}m)
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.exceptionsCount > 0 ? (
                        <Badge variant="destructive" className="text-xs">
                          {row.exceptionsCount} need review
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/attendance?branchId=${row.branchId}&date=${startDate}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Daily View &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
