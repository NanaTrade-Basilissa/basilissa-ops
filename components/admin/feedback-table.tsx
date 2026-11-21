"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { InspectorSheet } from "@/components/admin/inspector-sheet";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge, ratingBadgeVariant } from "@/components/ui/badge";
import { formatAccraDateTime } from "@/lib/platform/date";

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
            <StatusBadge tone="info" title="Includes written comment">
              <MessageSquareText className="size-3" />
              <span>Note</span>
            </StatusBadge>
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
        ariaLabel="Customer feedback submissions"
        emptyMessage="No submissions match the selected filters."
        onRowClick={(row) => setSelectedSubmission(row)}
      />

      <InspectorSheet
        open={!!selectedSubmission}
        onOpenChange={(open) => !open && setSelectedSubmission(null)}
        title="Feedback Details"
        description={
          selectedSubmission
            ? `${selectedSubmission.branch.name} · ${formatAccraDateTime(selectedSubmission.submittedAt)}`
            : undefined
        }
        badge={
          selectedSubmission ? (
            <Badge variant={ratingBadgeVariant(Math.round(selectedSubmission.overallScore))}>
              {selectedSubmission.overallScore.toFixed(1)} / 5
            </Badge>
          ) : undefined
        }
        size="sm"
      >
        {selectedSubmission && (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 font-mono text-xs">
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
                      <div key={a.id} className="space-y-1.5 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-0.5">
                            <span className="font-mono text-xs text-muted-foreground">Q{a.question.order}</span>
                            <p className="text-xs font-medium text-foreground">{a.question.text}</p>
                          </div>
                          {!isText && a.score !== null && (
                            <Badge variant={ratingBadgeVariant(a.score)} className="shrink-0 font-mono">
                              {a.score} / 5
                            </Badge>
                          )}
                        </div>
                        {isText && (
                          <div className="whitespace-pre-wrap rounded-md border border-border/70 bg-muted/40 p-2.5 text-xs text-foreground">
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
                <p className="text-xs italic text-muted-foreground">No detailed question responses available.</p>
              )}
            </div>
          </div>
        )}
      </InspectorSheet>
    </>
  );
}
