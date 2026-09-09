import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ClipboardCheck, Plus } from "lucide-react";
import { can, requirePermission } from "@/lib/modules/identity/server";
import { listAssessments } from "@/lib/modules/assessments/server";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { AssessmentsTable } from "@/components/admin/assessments-table";

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
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardCheck />
            </EmptyMedia>
            <EmptyTitle>Nothing here yet</EmptyTitle>
            <EmptyDescription>An assessment is a set of sections, each with its own questions.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <AssessmentsTable assessments={assessments} />
      )}
    </div>
  );
}
