"use client";

import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { EmployeeDetailSheet } from "@/components/admin/employee-detail-sheet";
import { StatusBadge } from "@/components/admin/status-badge";
import { DEPARTMENT_LABELS, resolveEmployeeDepartment } from "@/lib/modules/employees/constants";

export type EmployeeRow = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  department: string | null;
  email: string | null;
  status: string;
  /** Active mobile-app bindings; non-empty means a phone is bound. */
  deviceIdentities: { id: string }[];
  branchAssignments: { isPrimary: boolean; branch: { name: string } }[];
};

const columnHelper = createColumnHelper<typeof dataTableFeatures, EmployeeRow>();

export function EmployeesTable({ employees }: { employees: EmployeeRow[] }) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("employeeCode", {
          header: "Code",
          cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
        }),
        columnHelper.display({
          id: "name",
          header: "Name",
          cell: ({ row }) => {
            const dept = resolveEmployeeDepartment(row.original);
            const deptLabel = DEPARTMENT_LABELS[dept] || dept;
            return (
              <div>
                <span className="font-medium text-foreground">
                  {row.original.firstName} {row.original.lastName}
                </span>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {row.original.jobTitle && (
                    <span className="text-xs text-muted-foreground">{row.original.jobTitle}</span>
                  )}
                  <StatusBadge tone="neutral">{deptLabel}</StatusBadge>
                </div>
              </div>
            );
          },
        }),
        columnHelper.accessor("email", {
          header: "Email",
          cell: (info) =>
            info.getValue() ?? <span className="text-xs italic text-muted-foreground">None on file</span>,
        }),
        columnHelper.display({
          id: "branches",
          header: "Branches",
          cell: ({ row }) =>
            row.original.branchAssignments.length === 0 ? (
              <StatusBadge tone="critical">Unassigned</StatusBadge>
            ) : (
              <span className="text-sm text-muted-foreground">
                {row.original.branchAssignments
                  .map((a) => `${a.branch.name}${a.isPrimary ? " (primary)" : ""}`)
                  .join(", ")}
              </span>
            ),
        }),
        columnHelper.display({
          id: "device",
          header: "App Device",
          cell: ({ row }) =>
            row.original.deviceIdentities.length > 0 ? (
              <StatusBadge tone="good" dot>
                Bound
              </StatusBadge>
            ) : (
              <StatusBadge tone="neutral">Not bound</StatusBadge>
            ),
        }),
        columnHelper.accessor("status", {
          header: "Status",
          cell: (info) => {
            const status = info.getValue();
            const tone =
              status === "ACTIVE"
                ? "good"
                : status === "SUSPENDED"
                  ? "warning"
                  : status === "TERMINATED"
                    ? "critical"
                    : "neutral";
            return (
              <StatusBadge tone={tone} dot>
                {status.charAt(0) + status.slice(1).toLowerCase()}
              </StatusBadge>
            );
          },
        }),
      ]),
    [],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={employees}
        ariaLabel="Employees directory"
        onRowClick={(row) => setSelectedEmployeeId(row.id)}
        emptyMessage="No employees match the selected filters."
      />
      <EmployeeDetailSheet
        employeeId={selectedEmployeeId}
        open={selectedEmployeeId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedEmployeeId(null);
        }}
      />
    </>
  );
}
