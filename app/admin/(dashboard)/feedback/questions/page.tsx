import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { createQuestion } from "@/lib/modules/questions/actions";
import { FEEDBACK_QUESTION_COUNT } from "@/lib/modules/feedback/constants";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { QuestionDialog } from "@/components/admin/question-dialog";
import { QuestionsTable } from "@/components/admin/questions-table";
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Feedback Questions</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Customer survey questions ({FEEDBACK_QUESTION_COUNT} active required).
          </p>
        </div>
        <QuestionDialog
          action={createQuestion}
          submitLabel="Create question"
          title="Create a question"
          description="New questions are added to the end of the order."
          activeCount={activeCount}
          activeCap={FEEDBACK_QUESTION_COUNT}
          trigger={
            <Button>
              <Plus className="size-4" /> New question
            </Button>
          }
        />
      </div>

      {typeof error === "string" && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <p className="text-sm font-medium text-foreground">
        {activeCount} / {FEEDBACK_QUESTION_COUNT} active
      </p>

      <QuestionsTable questions={questions} activeCount={activeCount} maxActive={FEEDBACK_QUESTION_COUNT} />
    </div>
  );
}
