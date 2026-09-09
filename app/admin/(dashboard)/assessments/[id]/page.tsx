import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
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
  deleteQuestionAction,
  inviteManyToAssessmentAction,
  inviteToAssessmentAction,
  publishAssessmentAction,
  resendInvitationAction,
  revokeInvitationAction,
  updateAssessmentAction,
  updatePublicLinkAction,
} from "@/lib/modules/assessments/actions";
import { AssessmentLifecycle } from "@/components/admin/assessment-lifecycle";
import { AssessmentWorkspace } from "@/components/admin/assessment-workspace";
import { Badge } from "@/components/ui/badge";
import { getEnv } from "@/lib/platform/env";

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
    <div className="mx-auto max-w-4xl space-y-6">
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

      <AssessmentWorkspace
        isDraft={isDraft}
        isClosed={assessment.status === "CLOSED"}
        isPublished={assessment.status === "PUBLISHED"}
        canWrite={canWrite}
        assessmentId={assessment.id}
        sections={assessment.sections}
        addSectionAction={addSectionAction.bind(null, assessment.id)}
        addQuestionAction={addQuestionAction.bind(null, assessment.id)}
        deleteQuestionAction={deleteQuestionAction.bind(null, assessment.id)}
        summary={summary}
        invitations={invitations}
        employees={employees.map((e) => ({
          id: e.id,
          label: `${e.firstName} ${e.lastName} (${e.employeeCode})`,
        }))}
        inviteAction={inviteToAssessmentAction.bind(null, assessment.id)}
        inviteManyAction={inviteManyToAssessmentAction.bind(null, assessment.id)}
        resendAction={resendInvitationAction.bind(null, assessment.id)}
        revokeAction={revokeInvitationAction.bind(null, assessment.id)}
        publicLinkAction={updatePublicLinkAction.bind(null, assessment.id)}
        publicLinkUrl={
          assessment.publicLinkToken
            ? `${getEnv().NEXT_PUBLIC_APP_URL}/assessment/public/${assessment.publicLinkToken}`
            : null
        }
        publicLinkValues={{
          enabled: assessment.publicLinkEnabled,
          nameMode: assessment.publicLinkNameMode,
          emailMode: assessment.publicLinkEmailMode,
        }}
        detailsAction={updateAssessmentAction.bind(null, assessment.id)}
        detailsValues={{
          title: assessment.title,
          description: assessment.description,
          showScoreToTaker: assessment.showScoreToTaker,
          passMarkPercent: assessment.passMarkPercent,
          invitationsExpire: assessment.invitationsExpire,
          invitationTtlHours: assessment.invitationTtlHours,
        }}
      />
    </div>
  );
}
