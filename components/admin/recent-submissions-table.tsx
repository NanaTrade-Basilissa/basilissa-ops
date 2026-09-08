import Link from "next/link";
import { Badge, ratingBadgeVariant } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        No submissions yet for the selected filters.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Submitted</TableHead>
          {showBranch && <TableHead>Branch</TableHead>}
          {submissions[0].answers.map((a) => (
            <TableHead key={a.questionId} className="text-center" title={a.questionText}>
              Q{a.questionOrder}
            </TableHead>
          ))}
          <TableHead className="text-right">Overall</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {submissions.map((s) => (
          <TableRow key={s.id} id={`submission-${s.id}`} className="scroll-mt-24">
            <TableCell className="text-muted-foreground">{formatAccraDateTime(s.submittedAt)}</TableCell>
            {showBranch && (
              <TableCell>
                <Link href={`/admin/branches/${s.branchId}`} className="font-medium text-foreground hover:underline">
                  {s.branchName}
                </Link>
              </TableCell>
            )}
            {s.answers.map((a) => (
              <TableCell key={a.questionId} className="text-center">
                {a.score}
              </TableCell>
            ))}
            <TableCell className="text-right">
              <Badge variant={ratingBadgeVariant(Math.round(s.overallScore))}>
                {s.overallScore.toFixed(1)}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
