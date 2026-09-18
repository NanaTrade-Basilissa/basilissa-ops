import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ClipboardCheck, FileEdit, ListChecks, Plus, Send } from "lucide-react";
import { can, requirePermission } from "@/lib/modules/identity/server";
import { assessmentOverview } from "@/lib/modules/assessments/server";
import { createAssessmentAction } from "@/lib/modules/assessments/actions";
import { STATUS_LABEL } from "@/lib/modules/assessments/constants";
import { StatCard } from "@/components/admin/stat-card";
import { AssessmentCreateDialog } from "@/components/admin/assessment-create-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAccraDateTime } from "@/lib/platform/date";

export const metadata: Metadata = { title: "Assessments" };
export const dynamic = "force-dynamic";

/**
 * The landing page for the Assessments section — a high-level picture, not
 * the place authoring or invitations happen. Those stay on the pages that
 * already do them (`/all`, `/new`, `/[id]`); this one exists so entering
 * "Assessments" answers "what is the state of this system" before anything
 * else.
 */
export default async function AssessmentsOverviewPage() {
  const actor = await requirePermission("assessment:read");
  const canWrite = can(actor, "assessment:write");
  const overview = await assessmentOverview();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Assessments</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Staff tests and evaluation results.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/assessments/all" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ListChecks className="size-4" /> View all
          </Link>
          {canWrite && (
            <AssessmentCreateDialog
              action={createAssessmentAction}
              trigger={
                <Button size="sm">
                  <Plus className="size-4" /> New assessment
                </Button>
              }
            />
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total assessments" value={overview.total} icon={ClipboardCheck} />
        <StatCard label="Active" value={overview.published} subtext="Published" icon={Send} tone="good" />
        <StatCard label="Draft" value={overview.draft} icon={FileEdit} />
        <StatCard
          label="Completed submissions"
          value={overview.totalSubmitted}
          subtext={`${overview.totalInvitations} invited in total`}
          icon={CheckCircle2}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent assessments</CardTitle>
            <CardDescription className="text-xs">Latest created assessments.</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.recentAssessments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing yet.{" "}
                {canWrite && (
                  <AssessmentCreateDialog
                    action={createAssessmentAction}
                    trigger={
                      <button type="button" className="underline underline-offset-4">
                        Create the first one
                      </button>
                    }
                  />
                )}
              </p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {overview.recentAssessments.map((assessment) => (
                  <li key={assessment.id} className="flex items-center gap-3 py-2.5">
                    <Link
                      href={`/admin/assessments/${assessment.id}`}
                      className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline"
                    >
                      {assessment.title}
                    </Link>
                    <Badge variant={assessment.status === "PUBLISHED" ? "default" : "outline"} className="shrink-0 text-xs">
                      {STATUS_LABEL[assessment.status]}
                    </Badge>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatAccraDateTime(assessment.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
            <CardDescription className="text-xs">Latest completed submissions.</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nobody has completed one yet.
              </p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {overview.recentActivity.map((response) => (
                  <li key={response.id} className="py-2.5">
                    <Link
                      href={`/admin/assessments/${response.invitation.assessment.id}/responses/${response.id}`}
                      className="block"
                    >
                      <span className="font-medium">{response.invitation.inviteeName}</span>{" "}
                      <span className="text-muted-foreground">completed</span>{" "}
                      <span className="underline-offset-4 hover:underline">
                        {response.invitation.assessment.title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatAccraDateTime(response.submittedAt!)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
