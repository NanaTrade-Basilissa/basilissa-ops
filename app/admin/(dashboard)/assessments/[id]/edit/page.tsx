import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { can, requirePermission } from "@/lib/modules/identity/server";
import { getAssessmentForEditing } from "@/lib/modules/assessments/server";
import { STATUS_LABEL } from "@/lib/modules/assessments/constants";
import {
  addQuestionAction,
  addSectionAction,
  deleteQuestionAction,
  updateAssessmentAction,
  updateQuestionAction,
  updateSectionAction,
} from "@/lib/modules/assessments/actions";
import { AssessmentEditor } from "@/components/admin/assessment-editor";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Edit Assessment" };
export const dynamic = "force-dynamic";

export default async function EditAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("assessment:read");
  const { id } = await params;
  const canWrite = can(actor, "assessment:write");

  const assessment = await getAssessmentForEditing(id);
  if (!assessment) notFound();

  const isDraft = assessment.status === "DRAFT";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href={`/admin/assessments/${assessment.id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to assessment overview
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Edit: {assessment.title}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage assessment questions, sections, and scoring.
          </p>
        </div>
        <Badge variant={assessment.status === "PUBLISHED" ? "default" : "outline"}>
          {STATUS_LABEL[assessment.status]}
        </Badge>
      </div>

      <AssessmentEditor
        isDraft={isDraft}
        isClosed={assessment.status === "CLOSED"}
        canWrite={canWrite}
        assessmentId={assessment.id}
        sections={assessment.sections}
        addSectionAction={addSectionAction.bind(null, assessment.id)}
        updateSectionAction={updateSectionAction.bind(null, assessment.id)}
        addQuestionAction={addQuestionAction.bind(null, assessment.id)}
        updateQuestionAction={updateQuestionAction.bind(null, assessment.id)}
        deleteQuestionAction={deleteQuestionAction.bind(null, assessment.id)}
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
