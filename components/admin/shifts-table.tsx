"use client";

import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";

export type ShiftRow = {
  id: string;
  name: string;
  isActive: boolean;
  hoursLabel: string;
  overnight: boolean;
  breakLabel: string;
  branchLabel: string;
  assignmentCount: number;
  canEdit: boolean;
};

const columnHelper = createColumnHelper<typeof dataTableFeatures, ShiftRow>();

const columns = columnHelper.columns([
  columnHelper.display({
    id: "name",
    header: "Name",
    cell: ({ row }) => (
      <>
        {row.original.canEdit ? (
          <Link href={`/admin/shifts/${row.original.id}/edit`} className="font-medium underline">
            {row.original.name}
          </Link>
        ) : (
          <span className="font-medium">{row.original.name}</span>
        )}
        {!row.original.isActive && (
          <Badge variant="outline" className="ml-2">
            inactive
          </Badge>
        )}
      </>
    ),
  }),
  columnHelper.display({
    id: "hours",
    header: "Hours",
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.hoursLabel}
        {row.original.overnight && (
          <Badge variant="outline" className="ml-2" title="Anchored to the day it starts">
            overnight
          </Badge>
        )}
      </span>
    ),
  }),
  columnHelper.accessor("breakLabel", {
    header: "Break",
    cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("branchLabel", {
    header: "Branch",
    cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("assignmentCount", {
    header: "In use",
    cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue()}</span>,
  }),
]);

export function ShiftsTable({ shifts }: { shifts: ShiftRow[] }) {
  return <DataTable columns={columns} data={shifts} />;
}
