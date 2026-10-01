"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { TableRowActions } from "@/components/admin/table-row-actions";
import { HolidayDialog } from "@/components/admin/holiday-dialog";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteHolidayAction } from "@/lib/modules/attendance/actions";

export type HolidayRow = {
  id: string;
  dateKey: string;
  name: string;
  source: "CALENDAR" | "MANUAL";
  confirmed: boolean;
};

function formatDate(dateKey: string): { day: string; date: string } {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  return {
    day: new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(date),
    date: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(date),
  };
}

function DeleteHolidayDialog({
  holiday,
  open,
  onOpenChange,
}: {
  holiday: HolidayRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {holiday.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {formatDate(holiday.dateKey).date} becomes a normal working day. Staff on office hours will be
            scheduled again, and attendance already recorded that day is recalculated.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await deleteHolidayAction(holiday.id);
                toast.success("Holiday removed");
                onOpenChange(false);
              })
            }
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const columnHelper = createColumnHelper<typeof dataTableFeatures, HolidayRow>();

export function HolidaysTable({ holidays, canEdit }: { holidays: HolidayRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<HolidayRow | null>(null);

  const columns = columnHelper.columns([
    columnHelper.accessor("dateKey", {
      header: "Date",
      cell: (info) => {
        const { day, date } = formatDate(info.getValue());
        return (
          <div className="space-y-0.5">
            <span className="font-medium text-foreground">{date}</span>
            <span className="block text-xs text-muted-foreground">{day}</span>
          </div>
        );
      },
    }),
    columnHelper.accessor("name", {
      header: "Holiday",
      cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>,
    }),
    columnHelper.accessor("confirmed", {
      header: "Status",
      cell: (info) =>
        info.getValue() ? (
          <Badge variant="outline" className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 className="size-3" />
            Confirmed
          </Badge>
        ) : (
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Estimated
          </Badge>
        ),
    }),
    columnHelper.accessor("source", {
      header: "Added from",
      cell: (info) => (
        <span className="text-sm text-muted-foreground">
          {info.getValue() === "CALENDAR" ? "Ghana calendar" : "Added by hand"}
        </span>
      ),
    }),
    ...(canEdit
      ? [
          columnHelper.display({
            id: "actions",
            header: () => <div className="text-right sr-only sm:not-sr-only">Actions</div>,
            cell: ({ row }) => (
              <div className="flex justify-end">
                <TableRowActions
                  actions={[
                    { label: "Edit", icon: Pencil, onClick: () => setEditing(row.original) },
                    {
                      label: "Remove",
                      icon: Trash2,
                      variant: "destructive",
                      dialog: (props) => <DeleteHolidayDialog holiday={row.original} {...props} />,
                    },
                  ]}
                />
              </div>
            ),
          }),
        ]
      : []),
  ]);

  return (
    <>
      <DataTable
        columns={columns}
        data={holidays}
        emptyMessage="No holidays for this year yet. Load the Ghana calendar or add one."
      />
      {editing && (
        <HolidayDialog
          key={editing.id}
          holiday={editing}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      )}
    </>
  );
}
