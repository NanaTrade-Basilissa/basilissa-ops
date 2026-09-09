"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { moveQuestion, toggleQuestionActive, updateQuestion } from "@/lib/modules/questions/actions";
import { QuestionDialog } from "@/components/admin/question-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type QuestionRow = {
  id: string;
  text: string;
  isActive: boolean;
  ratingLabels: string[];
};

const columnHelper = createColumnHelper<typeof dataTableFeatures, QuestionRow>();

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
      cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>,
    }),
    columnHelper.accessor("isActive", {
      header: "Status",
      cell: (info) => <Badge variant={info.getValue() ? "default" : "outline"}>{info.getValue() ? "Active" : "Inactive"}</Badge>,
    }),
    columnHelper.display({
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1.5">
          <QuestionDialog
            action={updateQuestion.bind(null, row.original.id)}
            submitLabel="Save changes"
            title="Edit question"
            description="Editing the text does not affect past feedback answers."
            defaultValues={{
              text: row.original.text,
              isActive: row.original.isActive,
              ratingLabels: row.original.ratingLabels,
            }}
            activeCount={activeCount - (row.original.isActive ? 1 : 0)}
            activeCap={maxActive}
            trigger={
              <Button variant="outline" size="sm">
                Edit
              </Button>
            }
          />
          <form action={toggleQuestionActive}>
            <input type="hidden" name="id" value={row.original.id} />
            <input type="hidden" name="nextIsActive" value={(!row.original.isActive).toString()} />
            <Button
              size="sm"
              variant={row.original.isActive ? "destructive" : "secondary"}
              type="submit"
              disabled={!row.original.isActive && activeCount >= maxActive}
            >
              {row.original.isActive ? "Deactivate" : "Activate"}
            </Button>
          </form>
        </div>
      ),
    }),
  ]), [activeCount, maxActive]);

  return <DataTable columns={columns} data={questions} emptyMessage="No questions yet." />;
}
