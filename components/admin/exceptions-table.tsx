"use client";

import Link from "next/link";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { ResolveExceptionDialog } from "@/components/admin/resolve-exception-dialog";
import { TableRowActions } from "@/components/admin/table-row-actions";
import type { AttendanceExceptionItem } from "@/lib/modules/attendance/queries";
import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";

function time(value: Date | null): string {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: DISPLAY_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
      }).format(value)
    : "-";
}

function hours(minutes: number): string {
  if (minutes === 0) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function getFlagBadge(flag: string) {
  switch (flag) {
    case "AUTO_CLOSED":
      return (
        <Badge key={flag} variant="outline" className="border-purple-300 bg-purple-50 text-purple-800 text-[11px]">
          Auto-closed shift
        </Badge>
      );
    case "MISSING_CLOCK_OUT":
      return (
        <Badge key={flag} variant="outline" className="border-rose-300 bg-rose-50 text-rose-800 text-[11px]">
          Missing clock-out
        </Badge>
      );
    case "MISSING_CLOCK_IN":
      return (
        <Badge key={flag} variant="outline" className="border-rose-300 bg-rose-50 text-rose-800 text-[11px]">
          Missing clock-in
        </Badge>
      );
    case "OUTSIDE_GEOFENCE":
      return (
        <Badge key={flag} variant="outline" className="border-orange-300 bg-orange-50 text-orange-800 text-[11px]">
          Outside geofence
        </Badge>
      );
    case "MANUAL_ENTRY":
      return (
        <Badge key={flag} variant="outline" className="border-blue-300 bg-blue-50 text-blue-800 text-[11px]">
          Manual punch
        </Badge>
      );
    case "LATE_ARRIVAL":
      return (
        <Badge key={flag} variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[11px]">
          Late arrival
        </Badge>
      );
    default:
      return (
        <Badge key={flag} variant="outline" className="text-[11px]">
          {flag.toLowerCase().replace(/_/g, " ")}
        </Badge>
      );
  }
}

const columnHelper = createColumnHelper<typeof dataTableFeatures, AttendanceExceptionItem>();

export function ExceptionsTable({
  exceptions,
  canWrite = true,
}: {
  exceptions: AttendanceExceptionItem[];
  canWrite?: boolean;
}) {
  const columns = columnHelper.columns([
    columnHelper.accessor("employeeName", {
      header: "Employee",
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <Link
            href={`/admin/attendance/${row.original.employeeId}/${row.original.workDate}`}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {row.original.employeeName}
          </Link>
          {row.original.employeeCode && (
            <span className="block font-mono text-xs text-muted-foreground">
              {row.original.employeeCode}
            </span>
          )}
        </div>
      ),
    }),

    columnHelper.accessor("branchName", {
      header: "Branch",
      cell: (info) => (
        <span className="text-sm font-medium text-foreground">{info.getValue()}</span>
      ),
    }),

    columnHelper.accessor("workDate", {
      header: "Work Date",
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <span className="font-mono text-xs font-semibold">{row.original.workDate}</span>
          <span className="block text-[11px] text-muted-foreground">{row.original.shiftName}</span>
        </div>
      ),
    }),

    columnHelper.display({
      id: "punches",
      header: "Recorded Punches",
      cell: ({ row }) => (
        <div className="text-xs space-y-0.5 font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground w-8">IN:</span>
            <span className="font-semibold text-foreground">{time(row.original.actualIn)}</span>
            {row.original.lateMinutes > 0 && (
              <span className="text-amber-700 font-sans text-[11px] font-medium">
                ({row.original.lateMinutes}m late)
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground w-8">OUT:</span>
            <span className="font-semibold text-foreground">{time(row.original.actualOut)}</span>
          </div>
        </div>
      ),
    }),

    columnHelper.display({
      id: "flags",
      header: "Exception Reason",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1 max-w-xs">
          {row.original.flags.length > 0 ? (
            row.original.flags.map(getFlagBadge)
          ) : (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[11px]">
              Requires review
            </Badge>
          )}
        </div>
      ),
    }),

    columnHelper.display({
      id: "overtime",
      header: "Overtime",
      cell: ({ row }) => {
        const calculated = row.original.overtimeMinutes;
        const payable = row.original.payableOvertimeMinutes;
        return (
          <div className="text-xs space-y-0.5">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Calc:</span>
              <span className="font-semibold">{hours(calculated)}</span>
            </div>
            {payable > 0 && (
              <div className="flex items-center gap-1 text-emerald-700 font-medium">
                <span>Auth:</span>
                <span>{hours(payable)}</span>
              </div>
            )}
          </div>
        );
      },
    }),

    columnHelper.display({
      id: "actions",
      header: () => <div className="text-right sr-only sm:not-sr-only">Actions</div>,
      cell: ({ row }) => {
        const item = row.original;

        return (
          <TableRowActions
            actions={[
              canWrite && {
                id: "resolve",
                label: "Review exception",
                icon: AlertTriangle,
                dialog: (props) => (
                  <ResolveExceptionDialog
                    open={props.open}
                    onOpenChange={props.onOpenChange}
                    employeeId={item.employeeId}
                    employeeName={item.employeeName}
                    branchId={item.branchId}
                    dateKey={item.workDate}
                    flags={item.flags}
                    calculatedOvertimeMinutes={item.overtimeMinutes}
                    payableOvertimeMinutes={item.payableOvertimeMinutes}
                    canAuthorizeOvertime={true}
                  />
                ),
              },
              {
                id: "inspect",
                label: "Inspect day",
                icon: ArrowRight,
                href: `/admin/attendance/${item.employeeId}/${item.workDate}`,
              },
            ]}
          />
        );
      },
    }),
  ]);

  return <DataTable columns={columns} data={exceptions} />;
}
