import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { can, requirePermission } from "@/lib/modules/identity/server";
import { getAptitudeTestForEditing } from "@/lib/modules/aptitude/server";
import { STATUS_LABEL } from "@/lib/modules/aptitude/constants";
import {
  addQuestionAction,
  addSectionAction,
  deleteQuestionAction,
  updateAptitudeTestAction,
  updateQuestionAction,
  updateSectionAction,
} from "@/lib/modules/aptitude/actions";
import { AptitudeTestEditor } from "@/components/admin/aptitude-test-editor";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Edit Aptitude Test" };
export const dynamic = "force-dynamic";

export default async function EditAptitudeTestPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("aptitude:read");
  const { id } = await params;
  const canWrite = can(actor, "aptitude:write");

  const test = await getAptitudeTestForEditing(id);
  if (!test) notFound();

  const isDraft = test.status === "DRAFT";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href={`/admin/aptitude-tests/${test.id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to test overview
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Edit: {test.title}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage test questions, scoring, and configuration.
          </p>
        </div>
        <Badge variant={test.status === "PUBLISHED" ? "default" : "outline"}>
          {STATUS_LABEL[test.status]}
        </Badge>
      </div>

      <AptitudeTestEditor
        isDraft={isDraft}
        isClosed={test.status === "CLOSED"}
        canWrite={canWrite}
        testId={test.id}
        sections={test.sections}
        addSectionAction={addSectionAction.bind(null, test.id)}
        updateSectionAction={updateSectionAction.bind(null, test.id)}
        addQuestionAction={addQuestionAction.bind(null, test.id)}
        updateQuestionAction={updateQuestionAction.bind(null, test.id)}
        deleteQuestionAction={deleteQuestionAction.bind(null, test.id)}
        detailsAction={updateAptitudeTestAction.bind(null, test.id)}
        detailsValues={{
          title: test.title,
          description: test.description,
          showScoreToCandidate: test.showScoreToCandidate,
          passMarkPercent: test.passMarkPercent,
          invitationsExpire: test.invitationsExpire,
          invitationTtlHours: test.invitationTtlHours,
          timeLimitMinutes: test.timeLimitMinutes,
        }}
      />
    </div>
  );
}
