"use client";

import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { updateShift } from "@/lib/modules/employees/actions";
import { ShiftDialog } from "@/components/admin/shift-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  branchId: string;
  startTime: string;
  endTime: string;
  unpaidBreakMinutes: number;
};

const columnHelper = createColumnHelper<typeof dataTableFeatures, ShiftRow>();

function buildColumns(branches: { id: string; name: string }[]) {
  return columnHelper.columns([
  columnHelper.display({
    id: "name",
    header: "Name",
    cell: ({ row }) => (
      <>
        {row.original.canEdit ? (
          <ShiftDialog
            action={updateShift.bind(null, row.original.id)}
            branches={branches}
            submitLabel="Save changes"
            title="Edit shift"
            description="Changes affect future days only. Settled attendance keeps its original schedule."
            defaultValues={{
              name: row.original.name,
              branchId: row.original.branchId,
              startTime: row.original.startTime,
              endTime: row.original.endTime,
              unpaidBreakMinutes: row.original.unpaidBreakMinutes,
              isActive: row.original.isActive,
            }}
            trigger={
              <button type="button" className="font-medium underline-offset-4 hover:underline">
                {row.original.name}
              </button>
            }
          />
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
  columnHelper.display({
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) =>
      row.original.canEdit ? (
        <div className="flex justify-end">
          <ShiftDialog
            action={updateShift.bind(null, row.original.id)}
            branches={branches}
            submitLabel="Save changes"
            title="Edit shift"
            description="Changes affect future days only. Settled attendance keeps its original schedule."
            defaultValues={{
              name: row.original.name,
              branchId: row.original.branchId,
              startTime: row.original.startTime,
              endTime: row.original.endTime,
              unpaidBreakMinutes: row.original.unpaidBreakMinutes,
              isActive: row.original.isActive,
            }}
            trigger={
              <Button variant="ghost" size="sm">
                Edit
              </Button>
            }
          />
        </div>
      ) : null,
  }),
  ]);
}

export function ShiftsTable({
  shifts,
  branches,
}: {
  shifts: ShiftRow[];
  branches: { id: string; name: string }[];
}) {
  const columns = useMemo(() => buildColumns(branches), [branches]);
  return <DataTable columns={columns} data={shifts} />;
}
