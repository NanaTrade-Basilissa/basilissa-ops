import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Lock, Users } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { can, requirePermission } from "@/lib/modules/identity/server";
import {
  assessmentSummary,
  getAssessmentForEditing,
  listInvitations,
} from "@/lib/modules/assessments/server";
import { STATUS_LABEL } from "@/lib/modules/assessments/constants";
import {
  addQuestionAction,
  addSectionAction,
  closeAssessmentAction,
  deleteAssessmentAction,
  inviteManyToAssessmentAction,
  inviteToAssessmentAction,
  publishAssessmentAction,
  resendInvitationAction,
  revokeInvitationAction,
  updateAssessmentAction,
} from "@/lib/modules/assessments/actions";
import { AssessmentDetailsForm } from "@/components/admin/assessment-details-form";
import { AssessmentBuilder } from "@/components/admin/assessment-builder";
import { AssessmentLifecycle } from "@/components/admin/assessment-lifecycle";
import { InvitePanel } from "@/components/admin/invite-panel";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Assessment" };
export const dynamic = "force-dynamic";

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("assessment:read");
  const { id } = await params;
  const canWrite = can(actor, "assessment:write");

  const [assessment, invitations, summary, employees] = await Promise.all([
    getAssessmentForEditing(id),
    listInvitations(id),
    assessmentSummary(id),
    prisma.employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
    }),
  ]);

  if (!assessment) notFound();

  const questionCount = assessment.sections.reduce((n, s) => n + s.questions.length, 0);
  const isDraft = assessment.status === "DRAFT";

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href="/admin/assessments/all"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to assessments
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">{assessment.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={assessment.status === "PUBLISHED" ? "default" : "outline"}>
              {STATUS_LABEL[assessment.status]}
            </Badge>
            <span className="text-muted-foreground">
              {assessment.sections.length} sections · {questionCount} questions
            </span>
            {!assessment.showScoreToTaker && (
              <span className="text-muted-foreground">· score hidden from the taker</span>
            )}
          </div>
        </div>
        {canWrite && (
          <AssessmentLifecycle
            status={assessment.status}
            publishAction={publishAssessmentAction.bind(null, assessment.id)}
            closeAction={closeAssessmentAction.bind(null, assessment.id)}
            deleteAction={deleteAssessmentAction.bind(null, assessment.id)}
          />
        )}
      </div>

      {!isDraft && (
        <Alert>
          <Lock className="size-4" />
          <AlertTitle>Questions and scoring are frozen</AlertTitle>
          <AlertDescription>
            Two people who sat the same assessment must have sat the same assessment, so
            structure cannot change once published. The title and introduction can still be
            corrected.
          </AlertDescription>
        </Alert>
      )}

      {assessment.status === "PUBLISHED" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" />
              Who has it
            </CardTitle>
            <CardDescription>
              {summary.invited} invited · {summary.submitted} completed
              {summary.averagePercent !== null && ` · average ${summary.averagePercent}%`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InvitePanel
              assessmentId={assessment.id}
              canWrite={canWrite}
              employees={employees.map((e) => ({
                id: e.id,
                label: `${e.firstName} ${e.lastName} (${e.employeeCode})`,
              }))}
              invitations={invitations}
              inviteAction={inviteToAssessmentAction.bind(null, assessment.id)}
              inviteManyAction={inviteManyToAssessmentAction.bind(null, assessment.id)}
              resendAction={resendInvitationAction.bind(null, assessment.id)}
              revokeAction={revokeInvitationAction.bind(null, assessment.id)}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sections and questions</CardTitle>
          <CardDescription>
            {isDraft
              ? "Add a section, then questions inside it. The order shown here is the order people see."
              : "Frozen. This is what everybody sat."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AssessmentBuilder
            assessmentId={assessment.id}
            editable={canWrite && isDraft}
            sections={assessment.sections}
            addSectionAction={addSectionAction.bind(null, assessment.id)}
            addQuestionAction={addQuestionAction.bind(null, assessment.id)}
          />
        </CardContent>
      </Card>

      {canWrite && assessment.status !== "CLOSED" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <AssessmentDetailsForm
              action={updateAssessmentAction.bind(null, assessment.id)}
              submitLabel="Save details"
              values={{
                title: assessment.title,
                description: assessment.description,
                showScoreToTaker: assessment.showScoreToTaker,
                passMarkPercent: assessment.passMarkPercent,
              }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
