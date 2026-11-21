import Link from "next/link";
import { MessageSquareText, SearchX } from "lucide-react";
import { Badge, ratingBadgeVariant } from "@/components/ui/badge";
import { StatusBadge } from "@/components/admin/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type { RecentSubmissionRow } from "@/lib/modules/feedback/server";
import { formatAccraDateTime } from "@/lib/platform/date";

export function RecentSubmissionsTable({
  submissions,
  showBranch = true,
}: {
  submissions: RecentSubmissionRow[];
  showBranch?: boolean;
}) {
  if (submissions.length === 0) {
    return (
      <Empty className="border-0 py-8">
        <EmptyMedia variant="icon">
          <SearchX className="size-4" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>No submissions</EmptyTitle>
          <EmptyDescription>No feedback submissions match the selected filters.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  // Collect all unique RATING question columns in order so open-ended text questions
  // don't break numeric score columns.
  const ratingColumns = submissions[0].answers.filter((a) => a.questionType === "RATING" || a.score !== null);

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead>Submitted</TableHead>
          {showBranch && <TableHead>Branch</TableHead>}
          {ratingColumns.map((a) => (
            <TableHead key={a.questionId} className="text-center" title={a.questionText}>
              Q{a.questionOrder}
            </TableHead>
          ))}
          <TableHead className="text-right">Overall</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {submissions.map((s) => {
          const scoreByQuestionId = new Map(s.answers.map((a) => [a.questionId, a.score]));
          const textComments = s.answers
            .filter((a) => a.textResponse && a.textResponse.trim().length > 0)
            .map((a) => `${a.questionText}: ${a.textResponse}`)
            .join("\n\n");

          return (
            <TableRow key={s.id} id={`submission-${s.id}`} className="scroll-mt-24 hover:bg-muted/30">
              <TableCell className="text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span>{formatAccraDateTime(s.submittedAt)}</span>
                  {textComments && (
                    <StatusBadge tone="info" title={textComments}>
                      <MessageSquareText className="size-3" />
                      Note
                    </StatusBadge>
                  )}
                </div>
              </TableCell>
              {showBranch && (
                <TableCell>
                  <Link
                    href={`/admin/branches/${s.branchId}`}
                    className="font-medium text-foreground underline-offset-4 hover:underline cursor-pointer text-left"
                  >
                    {s.branchName}
                  </Link>
                </TableCell>
              )}
              {ratingColumns.map((col) => {
                const score = scoreByQuestionId.get(col.questionId);
                return (
                  <TableCell key={col.questionId} className="text-center">
                    {score != null ? score : "-"}
                  </TableCell>
                );
              })}
              <TableCell className="text-right">
                <Badge variant={ratingBadgeVariant(Math.round(s.overallScore))}>
                  {s.overallScore.toFixed(1)}
                </Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
