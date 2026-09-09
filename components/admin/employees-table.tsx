"use client";

import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";

export type EmployeeRow = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  email: string | null;
  status: string;
  branchAssignments: { isPrimary: boolean; branch: { name: string } }[];
};

const columnHelper = createColumnHelper<typeof dataTableFeatures, EmployeeRow>();

const columns = columnHelper.columns([
  columnHelper.accessor("employeeCode", {
    header: "Code",
    cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
  }),
  columnHelper.display({
    id: "name",
    header: "Name",
    cell: ({ row }) => (
      <>
        <Link href={`/admin/employees/${row.original.id}`} className="font-medium underline">
          {row.original.firstName} {row.original.lastName}
        </Link>
        {row.original.jobTitle && (
          <span className="block text-xs text-muted-foreground">{row.original.jobTitle}</span>
        )}
      </>
    ),
  }),
  columnHelper.accessor("email", {
    header: "Email",
    cell: (info) => info.getValue() ?? <span className="text-sm text-muted-foreground italic">none on file</span>,
  }),
  columnHelper.display({
    id: "branches",
    header: "Branches",
    cell: ({ row }) =>
      row.original.branchAssignments.length === 0 ? (
        // Without one they cannot clock in anywhere, which is worth saying
        // rather than showing an empty cell.
        <span className="text-sm text-destructive">Not assigned</span>
      ) : (
        <span className="text-sm text-muted-foreground">
          {row.original.branchAssignments
            .map((a) => `${a.branch.name}${a.isPrimary ? " (primary)" : ""}`)
            .join(", ")}
        </span>
      ),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => (
      <Badge variant={info.getValue() === "ACTIVE" ? "default" : "outline"}>{info.getValue().toLowerCase()}</Badge>
    ),
  }),
]);

export function EmployeesTable({ employees }: { employees: EmployeeRow[] }) {
  return <DataTable columns={columns} data={employees} emptyMessage="No employees match the selected filters." />;
}
