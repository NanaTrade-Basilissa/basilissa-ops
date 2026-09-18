"use client";

import { useState } from "react";
import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { Badge, ratingBadgeVariant } from "@/components/ui/badge";
import { formatAccraDateTime } from "@/lib/platform/date";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export type FeedbackRow = {
  id: string;
  submittedAt: Date;
  overallScore: number;
  branch: { id: string; name: string };
  answers?: {
    id: string;
    score: number;
    question: { text: string; order: number };
  }[];
};

const columnHelper = createColumnHelper<typeof dataTableFeatures, FeedbackRow>();

const columns = columnHelper.columns([
  columnHelper.accessor("id", {
    header: "Submission ID",
    cell: (info) => <span className="font-mono text-xs text-muted-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("submittedAt", {
    header: "Submitted",
    cell: (info) => <span className="text-muted-foreground">{formatAccraDateTime(info.getValue())}</span>,
  }),
  columnHelper.display({
    id: "branch",
    header: "Branch",
    cell: ({ row }) => (
      <Link
        href={`/admin/branches/${row.original.branch.id}`}
        className="font-medium text-foreground underline-offset-4 hover:underline cursor-pointer text-left"
      >
        {row.original.branch.name}
      </Link>
    ),
  }),
  columnHelper.accessor("overallScore", {
    header: () => <div className="text-right">Overall</div>,
    cell: (info) => (
      <div className="text-right">
        <Badge variant={ratingBadgeVariant(Math.round(info.getValue()))}>{info.getValue().toFixed(1)}</Badge>
      </div>
    ),
  }),
]);

export function FeedbackTable({ submissions }: { submissions: FeedbackRow[] }) {
  const [selectedSubmission, setSelectedSubmission] = useState<FeedbackRow | null>(null);

  return (
    <>
      <DataTable
        columns={columns}
        data={submissions}
        emptyMessage="No submissions match the selected filters."
        onRowClick={(row) => setSelectedSubmission(row)}
      />

      <Sheet open={!!selectedSubmission} onOpenChange={(open) => !open && setSelectedSubmission(null)}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          {selectedSubmission && (
            <>
              <SheetHeader>
                <div className="flex items-center justify-between gap-2 pr-6">
                  <SheetTitle>Feedback Details</SheetTitle>
                  <Badge variant={ratingBadgeVariant(Math.round(selectedSubmission.overallScore))}>
                    {selectedSubmission.overallScore.toFixed(1)} / 5
                  </Badge>
                </div>
                <SheetDescription>
                  {selectedSubmission.branch.name} · {formatAccraDateTime(selectedSubmission.submittedAt)}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 px-4 py-2 text-sm">
                <div className="rounded-md border p-2.5 bg-muted/40 font-mono text-xs">
                  <span className="text-muted-foreground">ID:</span> {selectedSubmission.id}
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Survey Responses
                  </h4>
                  {selectedSubmission.answers && selectedSubmission.answers.length > 0 ? (
                    <div className="divide-y divide-border rounded-lg border bg-card">
                      {selectedSubmission.answers.map((a) => (
                        <div key={a.id} className="p-3 flex items-start justify-between gap-3">
                          <div className="space-y-0.5">
                            <span className="text-xs font-mono text-muted-foreground">Q{a.question.order}</span>
                            <p className="text-xs font-medium text-foreground">{a.question.text}</p>
                          </div>
                          <Badge variant={ratingBadgeVariant(a.score)} className="shrink-0 font-mono">
                            {a.score} / 5
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No detailed question responses available.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
