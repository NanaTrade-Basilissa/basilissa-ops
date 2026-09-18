"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { EmployeeDetailSheet } from "@/components/admin/employee-detail-sheet";
import { UserCheck } from "lucide-react";
import { TableRowActions } from "@/components/admin/table-row-actions";
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
        <EmployeeDetailSheet
          employeeId={row.original.id}
          trigger={
            <button
              type="button"
              className="font-medium text-foreground underline-offset-4 hover:underline cursor-pointer text-left"
            >
              {row.original.firstName} {row.original.lastName}
            </button>
          }
        />
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
  columnHelper.display({
    id: "actions",
    header: () => <div className="text-right sr-only sm:not-sr-only">Actions</div>,
    cell: ({ row }) => (
      <TableRowActions
        actions={[
          {
            id: "profile",
            label: "View profile",
            icon: UserCheck,
            dialog: (props) => (
              <EmployeeDetailSheet
                employeeId={row.original.id}
                open={props.open}
                onOpenChange={props.onOpenChange}
              />
            ),
          },
        ]}
      />
    ),
  }),
]);

export function EmployeesTable({ employees }: { employees: EmployeeRow[] }) {
  return <DataTable columns={columns} data={employees} emptyMessage="No employees match the selected filters." />;
}
