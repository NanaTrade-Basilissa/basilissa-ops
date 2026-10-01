"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { TableRowActions } from "@/components/admin/table-row-actions";
import { PatternCycle } from "@/components/admin/pattern-cycle";
import { PatternDialog, type PatternShiftOption } from "@/components/admin/pattern-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { deletePatternAction, setPatternActiveAction } from "@/lib/modules/attendance/actions";

export type PatternRow = {
  id: string;
  name: string;
  branchId: string | null;
  branchName: string | null;
  isActive: boolean;
  cycle: (string | null)[];
  activeAssignments: number;
  canEdit: boolean;
};

function DeletePatternDialog({
  pattern,
  open,
  onOpenChange,
}: {
  pattern: PatternRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {pattern.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Only a pattern nobody has ever been on can be deleted. One that has been used keeps the record of
            past rotas; deactivate it instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await deletePatternAction(pattern.id);
                if (result.ok) {
                  toast.success("Pattern deleted");
                  router.refresh();
                } else {
                  toast.error(result.error ?? "Could not delete the pattern.");
                }
                onOpenChange(false);
              })
            }
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const columnHelper = createColumnHelper<typeof dataTableFeatures, PatternRow>();

export function PatternsTable({
  patterns,
  shifts,
  branches,
  allowGlobal,
  canCreate,
}: {
  patterns: PatternRow[];
  shifts: PatternShiftOption[];
  branches: { id: string; name: string }[];
  allowGlobal: boolean;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<PatternRow | null>(null);
  const [creating, setCreating] = useState(false);

  async function toggleActive(row: PatternRow) {
    const result = await setPatternActiveAction(row.id, !row.isActive);
    if (result.ok) {
      toast.success(row.isActive ? "Pattern deactivated" : "Pattern activated");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not change the pattern.");
    }
  }

  const columns = columnHelper.columns([
    columnHelper.accessor("name", {
      header: "Pattern",
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <span className="font-medium text-foreground">{row.original.name}</span>
          <span className="block text-xs text-muted-foreground">
            {row.original.cycle.length}-day cycle
          </span>
        </div>
      ),
    }),
    columnHelper.display({
      id: "cycle",
      header: "Cycle",
      cell: ({ row }) => <PatternCycle cycle={row.original.cycle} shifts={shifts} size="xs" />,
    }),
    columnHelper.accessor("branchName", {
      header: "Branch",
      cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue() ?? "All branches"}</span>,
    }),
    columnHelper.accessor("activeAssignments", {
      header: "People on it",
      cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
    }),
    columnHelper.accessor("isActive", {
      header: "Status",
      cell: (info) =>
        info.getValue() ? (
          <Badge variant="outline" className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Inactive
          </Badge>
        ),
    }),
    columnHelper.display({
      id: "actions",
      header: () => <div className="text-right sr-only sm:not-sr-only">Actions</div>,
      cell: ({ row }) =>
        row.original.canEdit ? (
          <div className="flex justify-end">
            <TableRowActions
              actions={[
                { label: "Edit", icon: Pencil, onClick: () => setEditing(row.original) },
                {
                  label: row.original.isActive ? "Deactivate" : "Activate",
                  icon: row.original.isActive ? Ban : CheckCircle2,
                  onClick: () => void toggleActive(row.original),
                },
                {
                  label: "Delete",
                  icon: Trash2,
                  variant: "destructive",
                  dialog: (props) => <DeletePatternDialog pattern={row.original} {...props} />,
                },
              ]}
            />
          </div>
        ) : null,
    }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Repeating rotas you can put people on from the Weekly Rota (Manage rota → Assign pattern). Editing a
          pattern changes the rota of everyone on it from today on Auto rota branches, and in weeks generated
          afterwards elsewhere.
        </p>
        {canCreate && (
          <Button size="sm" className="h-9 shrink-0 gap-1.5 text-xs" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">New pattern</span>
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={patterns}
        emptyMessage="No rota patterns yet. Create one, then assign people to it from the Weekly Rota."
      />

      {creating && (
        <PatternDialog
          branches={branches}
          allowGlobal={allowGlobal}
          shifts={shifts}
          open
          onOpenChange={(open) => !open && setCreating(false)}
        />
      )}
      {editing && (
        <PatternDialog
          key={editing.id}
          pattern={editing}
          branches={branches}
          allowGlobal={allowGlobal}
          shifts={shifts}
          open
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
    </div>
  );
}
