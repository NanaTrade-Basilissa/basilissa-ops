import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { can, requirePermission } from "@/lib/modules/identity/server";
import { aptitudeTestSummary, getAptitudeTestForEditing, listInvitations } from "@/lib/modules/aptitude/server";
import { STATUS_LABEL } from "@/lib/modules/aptitude/constants";
import {
  addQuestionAction,
  addSectionAction,
  closeAptitudeTestAction,
  deleteAptitudeTestAction,
  deleteQuestionAction,
  inviteManyByEmailAction,
  inviteToAptitudeTestAction,
  publishAptitudeTestAction,
  resendInvitationAction,
  revokeInvitationAction,
  updateAptitudeTestAction,
  updatePublicLinkAction,
  updateSectionAction,
} from "@/lib/modules/aptitude/actions";
import { AptitudeTestLifecycle } from "@/components/admin/aptitude-test-lifecycle";
import { AptitudeTestWorkspace } from "@/components/admin/aptitude-test-workspace";
import { Badge } from "@/components/ui/badge";
import { getEnv } from "@/lib/platform/env";

export const metadata: Metadata = { title: "Aptitude test" };
export const dynamic = "force-dynamic";

export default async function AptitudeTestPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("aptitude:read");
  const { id } = await params;
  const canWrite = can(actor, "aptitude:write");

  const [test, invitations, summary] = await Promise.all([
    getAptitudeTestForEditing(id),
    listInvitations(id),
    aptitudeTestSummary(id),
  ]);

  if (!test) notFound();

  const questionCount = test.sections.reduce((n, s) => n + s.questions.length, 0);
  const isDraft = test.status === "DRAFT";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/admin/aptitude-tests/all"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to aptitude tests
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">{test.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={test.status === "PUBLISHED" ? "default" : "outline"}>{STATUS_LABEL[test.status]}</Badge>
            <span className="text-muted-foreground">
              {test.sections.length} sections · {questionCount} questions
            </span>
            <span className="text-muted-foreground">
              · {test.timeLimitMinutes ? `${test.timeLimitMinutes} min timer` : "untimed"}
            </span>
            {!test.showScoreToCandidate && <span className="text-muted-foreground">· score hidden from the candidate</span>}
          </div>
        </div>
        {canWrite && (
          <AptitudeTestLifecycle
            status={test.status}
            publishAction={publishAptitudeTestAction.bind(null, test.id)}
            closeAction={closeAptitudeTestAction.bind(null, test.id)}
            deleteAction={deleteAptitudeTestAction.bind(null, test.id)}
          />
        )}
      </div>

      <AptitudeTestWorkspace
        isDraft={isDraft}
        isClosed={test.status === "CLOSED"}
        isPublished={test.status === "PUBLISHED"}
        canWrite={canWrite}
        testId={test.id}
        sections={test.sections}
        addSectionAction={addSectionAction.bind(null, test.id)}
        updateSectionAction={updateSectionAction.bind(null, test.id)}
        addQuestionAction={addQuestionAction.bind(null, test.id)}
        deleteQuestionAction={deleteQuestionAction.bind(null, test.id)}
        summary={summary}
        invitations={invitations}
        inviteAction={inviteToAptitudeTestAction.bind(null, test.id)}
        inviteManyAction={inviteManyByEmailAction.bind(null, test.id)}
        resendAction={resendInvitationAction.bind(null, test.id)}
        revokeAction={revokeInvitationAction.bind(null, test.id)}
        publicLinkAction={updatePublicLinkAction.bind(null, test.id)}
        publicLinkUrl={
          test.publicLinkToken ? `${getEnv().NEXT_PUBLIC_APP_URL}/aptitude/public/${test.publicLinkToken}` : null
        }
        publicLinkValues={{
          enabled: test.publicLinkEnabled,
          nameMode: test.publicLinkNameMode,
          emailMode: test.publicLinkEmailMode,
        }}
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
