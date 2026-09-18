"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Pencil, PowerOff } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { toast } from "sonner";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { moveQuestion, toggleQuestionActive, updateQuestion } from "@/lib/modules/questions/actions";
import { QuestionDialog } from "@/components/admin/question-dialog";
import { TableRowActions } from "@/components/admin/table-row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type QuestionRow = {
  id: string;
  text: string;
  isActive: boolean;
  ratingLabels: string[];
};

const columnHelper = createColumnHelper<typeof dataTableFeatures, QuestionRow>();

function QuestionTitleCell({
  row,
  activeCount,
  maxActive,
}: {
  row: QuestionRow;
  activeCount: number;
  maxActive: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-medium text-foreground underline-offset-4 hover:underline cursor-pointer text-left"
      >
        {row.text}
      </button>
      <QuestionDialog
        open={open}
        onOpenChange={setOpen}
        action={updateQuestion.bind(null, row.id)}
        submitLabel="Save changes"
        title="Edit question"
        description="Editing the text does not affect past feedback answers."
        defaultValues={{
          text: row.text,
          isActive: row.isActive,
          ratingLabels: row.ratingLabels,
        }}
        activeCount={activeCount - (row.isActive ? 1 : 0)}
        activeCap={maxActive}
      />
    </>
  );
}

function QuestionActionsCell({
  row,
  activeCount,
  maxActive,
}: {
  row: QuestionRow;
  activeCount: number;
  maxActive: number;
}) {
  const [isPending, startTransition] = useTransition();

  const handleToggleActive = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", row.id);
      fd.set("nextIsActive", (!row.isActive).toString());
      try {
        await toggleQuestionActive(fd);
        toast.success(row.isActive ? "Question deactivated" : "Question activated");
      } catch {
        toast.error("Failed to update question status");
      }
    });
  };

  return (
    <TableRowActions
      actions={[
        {
          label: "Edit question",
          icon: Pencil,
          dialog: (props) => (
            <QuestionDialog
              {...props}
              action={updateQuestion.bind(null, row.id)}
              submitLabel="Save changes"
              title="Edit question"
              description="Editing the text does not affect past feedback answers."
              defaultValues={{
                text: row.text,
                isActive: row.isActive,
                ratingLabels: row.ratingLabels,
              }}
              activeCount={activeCount - (row.isActive ? 1 : 0)}
              activeCap={maxActive}
            />
          ),
        },
        {
          label: row.isActive ? "Deactivate" : "Activate",
          icon: row.isActive ? PowerOff : CheckCircle2,
          variant: row.isActive ? "destructive" : "default",
          disabled: (!row.isActive && activeCount >= maxActive) || isPending,
          onSelect: handleToggleActive,
        },
      ]}
    />
  );
}

export function QuestionsTable({
  questions,
  activeCount,
  maxActive,
}: {
  questions: QuestionRow[];
  activeCount: number;
  maxActive: number;
}) {
  const columns = useMemo(() => columnHelper.columns([
    columnHelper.display({
      id: "order",
      header: () => <div className="w-16">Order</div>,
      cell: ({ row, table }) => {
        const rows = table.getRowModel().rows;
        const index = rows.findIndex((r) => r.original.id === row.original.id);
        return (
          <div className="flex items-center gap-1">
            <form action={moveQuestion}>
              <input type="hidden" name="id" value={row.original.id} />
              <input type="hidden" name="direction" value="up" />
              <Button type="submit" variant="ghost" size="icon-sm" disabled={index === 0} aria-label="Move up">
                <ArrowUp className="size-3.5" />
              </Button>
            </form>
            <form action={moveQuestion}>
              <input type="hidden" name="id" value={row.original.id} />
              <input type="hidden" name="direction" value="down" />
              <Button
                type="submit"
                variant="ghost"
                size="icon-sm"
                disabled={index === rows.length - 1}
                aria-label="Move down"
              >
                <ArrowDown className="size-3.5" />
              </Button>
            </form>
          </div>
        );
      },
    }),
    columnHelper.accessor("text", {
      header: "Question",
      cell: ({ row }) => (
        <QuestionTitleCell
          row={row.original}
          activeCount={activeCount}
          maxActive={maxActive}
        />
      ),
    }),
    columnHelper.accessor("isActive", {
      header: "Status",
      cell: (info) => <Badge variant={info.getValue() ? "default" : "outline"}>{info.getValue() ? "Active" : "Inactive"}</Badge>,
    }),
    columnHelper.display({
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => (
        <QuestionActionsCell
          row={row.original}
          activeCount={activeCount}
          maxActive={maxActive}
        />
      ),
    }),
  ]), [activeCount, maxActive]);

  return <DataTable columns={columns} data={questions} emptyMessage="No questions yet." />;
}
