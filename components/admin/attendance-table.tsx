"use client";

import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";

export type AttendanceRow = {
  id: string;
  employeeId: string;
  date: string;
  employeeName: string | null;
  employeeCode: string | null;
  branchName: string;
  actualInLabel: string;
  actualOutLabel: string;
  workedLabel: string;
  overtimeLabel: string;
  lateMinutes: number;
  status: string;
  flags: string[];
};

const columnHelper = createColumnHelper<typeof dataTableFeatures, AttendanceRow>();

const columns = columnHelper.columns([
  columnHelper.display({
    id: "employee",
    header: "Employee",
    cell: ({ row }) => (
      <>
        <Link href={`/admin/attendance/${row.original.employeeId}/${row.original.date}`} className="font-medium underline">
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
]);

export function AttendanceTable({ days }: { days: AttendanceRow[] }) {
  return <DataTable columns={columns} data={days} />;
}
