"use client";

import { useMemo } from "react";
import { Edit2 } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { TableRowActions } from "@/components/admin/table-row-actions";
import { updateShift } from "@/lib/modules/employees/actions";
import { ShiftDialog } from "@/components/admin/shift-dialog";
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
  branchId: string;
  startTime: string;
  endTime: string;
  unpaidBreakMinutes: number;
};

const columnHelper = createColumnHelper<typeof dataTableFeatures, ShiftRow>();

function buildColumns(branches: { id: string; name: string }[], allowGlobal: boolean = true) {
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
            allowGlobal={allowGlobal}
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
              <button
                type="button"
                className="font-medium text-foreground underline-offset-4 hover:underline cursor-pointer text-left"
              >
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
      <span className="text-sm font-medium">
        {row.original.hoursLabel}
        {row.original.overnight && (
          <span className="ml-1 text-xs text-muted-foreground font-normal">(overnight)</span>
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
    header: () => <div className="text-right sr-only sm:not-sr-only">Actions</div>,
    cell: ({ row }) => (
      <TableRowActions
        actions={[
          row.original.canEdit && {
            id: "edit",
            label: "Edit shift",
            icon: Edit2,
            dialog: (props) => (
              <ShiftDialog
                open={props.open}
                onOpenChange={props.onOpenChange}
                action={updateShift.bind(null, row.original.id)}
                branches={branches}
                allowGlobal={allowGlobal}
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
              />
            ),
          },
        ]}
      />
    ),
  }),
  ]);
}

export function ShiftsTable({
  shifts,
  branches,
  allowGlobal = true,
}: {
  shifts: ShiftRow[];
  branches: { id: string; name: string }[];
  allowGlobal?: boolean;
}) {
  const columns = useMemo(() => buildColumns(branches, allowGlobal), [branches, allowGlobal]);
  return <DataTable columns={columns} data={shifts} />;
}
