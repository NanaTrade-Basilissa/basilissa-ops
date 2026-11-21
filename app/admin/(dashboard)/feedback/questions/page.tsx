import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { createQuestion } from "@/lib/modules/questions/actions";
import { MAX_ACTIVE_FEEDBACK_QUESTIONS } from "@/lib/modules/feedback/constants";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { QuestionDialog } from "@/components/admin/question-dialog";
import { QuestionsTable } from "@/components/admin/questions-table";
import { PageHeader, PageShell } from "@/components/admin/page-shell";
import { FeedbackSectionTabs } from "@/components/admin/feedback-section-tabs";
import { StatusBadge } from "@/components/admin/status-badge";
import { requirePermission } from "@/lib/modules/identity/server";

export const metadata: Metadata = { title: "Feedback Questions" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function FeedbackQuestionsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission("question:read");

  const { error } = await searchParams;
  const questions = await prisma.question.findMany({ orderBy: { order: "asc" } });
  const activeCount = questions.filter((q) => q.isActive).length;

  return (
    <PageShell>
      <PageHeader
        title="Customer Feedback"
        description="Manage the rating and open-ended questions shown on customer feedback forms."
        badge={
          <StatusBadge tone={activeCount >= MAX_ACTIVE_FEEDBACK_QUESTIONS ? "warning" : "good"} dot>
            {activeCount} / {MAX_ACTIVE_FEEDBACK_QUESTIONS} active
          </StatusBadge>
        }
        actions={
          <QuestionDialog
            action={createQuestion}
            submitLabel="Create question"
            title="Create a question"
            description="Add a 1–5 rating question or an open-ended text question."
            activeCount={activeCount}
            activeCap={MAX_ACTIVE_FEEDBACK_QUESTIONS}
            trigger={
              <Button size="sm" className="h-9 gap-1.5">
                <Plus className="size-4" />
                <span>New question</span>
              </Button>
            }
          />
        }
        tabs={<FeedbackSectionTabs active="questions" />}
      />

      {typeof error === "string" && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <QuestionsTable questions={questions} activeCount={activeCount} maxActive={MAX_ACTIVE_FEEDBACK_QUESTIONS} />
    </PageShell>
  );
}
