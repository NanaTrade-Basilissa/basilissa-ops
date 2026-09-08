import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ClipboardCheck, Plus } from "lucide-react";
import { can, requirePermission } from "@/lib/modules/identity/server";
import { listAssessments } from "@/lib/modules/assessments/server";
import { STATUS_LABEL } from "@/lib/modules/assessments/constants";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAccraDateTime } from "@/lib/platform/date";

export const metadata: Metadata = { title: "All assessments" };
export const dynamic = "force-dynamic";

/**
 * The full list — what `/admin/assessments` (the Overview) used to be before
 * it grew a landing page of its own. Moved here rather than removed, so
 * nothing that linked to "every assessment" lost anywhere to go.
 */
export default async function AllAssessmentsPage() {
  const actor = await requirePermission("assessment:read");
  const canWrite = can(actor, "assessment:write");
  const assessments = await listAssessments();

  return (
    <div className="space-y-6">
      <Link
        href="/admin/assessments"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to overview
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">All assessments</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Scored tests sent to one person at a time on their own link, so a result belongs
            to somebody rather than to an anonymous submission.
          </p>
        </div>
        {canWrite && (
          <Link href="/admin/assessments/new" className={buttonVariants({ size: "sm" })}>
            <Plus className="size-4" /> New assessment
          </Link>
        )}
      </div>

      {assessments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ClipboardCheck className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nothing here yet. An assessment is a set of sections, each with its own
              questions.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sections</TableHead>
              <TableHead>Invited</TableHead>
              <TableHead>Score shown</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assessments.map((assessment) => (
              <TableRow key={assessment.id}>
                <TableCell>
                  <Link
                    href={`/admin/assessments/${assessment.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {assessment.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={assessment.status === "PUBLISHED" ? "default" : "outline"}>
                    {STATUS_LABEL[assessment.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{assessment._count.sections}</TableCell>
                <TableCell className="text-sm">{assessment._count.invitations}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {assessment.showScoreToTaker ? "to the taker" : "HR only"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatAccraDateTime(assessment.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
