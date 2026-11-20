"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquareText } from "lucide-react";
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
    score: number | null;
    textResponse?: string | null;
    question: { text: string; order: number; type?: "RATING" | "TEXT" };
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
    cell: ({ row }) => {
      const hasComment = row.original.answers?.some(
        (a) => a.textResponse && a.textResponse.trim().length > 0,
      );
      return (
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/branches/${row.original.branch.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-foreground underline-offset-4 hover:underline cursor-pointer text-left"
          >
            {row.original.branch.name}
          </Link>
          {hasComment && (
            <Badge
              variant="outline"
              className="gap-1 border-blue-200 bg-blue-50 text-blue-700 text-[10px] px-1.5 py-0"
              title="Includes written comment"
            >
              <MessageSquareText className="size-2.5" />
              <span>Note</span>
            </Badge>
          )}
        </div>
      );
    },
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
                      {selectedSubmission.answers.map((a) => {
                        const isText = a.question.type === "TEXT" || a.score === null;
                        return (
                          <div key={a.id} className="p-3 space-y-1.5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-0.5">
                                <span className="text-xs font-mono text-muted-foreground">Q{a.question.order}</span>
                                <p className="text-xs font-medium text-foreground">{a.question.text}</p>
                              </div>
                              {!isText && a.score !== null && (
                                <Badge variant={ratingBadgeVariant(a.score)} className="shrink-0 font-mono">
                                  {a.score} / 5
                                </Badge>
                              )}
                            </div>
                            {isText && (
                              <div className="rounded-md border border-border/70 bg-muted/40 p-2.5 text-xs text-foreground whitespace-pre-wrap">
                                {a.textResponse && a.textResponse.trim().length > 0 ? (
                                  a.textResponse
                                ) : (
                                  <span className="italic text-muted-foreground">No response provided</span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
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
