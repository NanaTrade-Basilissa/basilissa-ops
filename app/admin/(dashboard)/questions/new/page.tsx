import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { createQuestion } from "@/lib/modules/questions/actions";
import { FEEDBACK_QUESTION_COUNT } from "@/lib/modules/feedback/constants";
import { QuestionForm } from "@/components/admin/question-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requirePermission } from "@/lib/modules/identity/server";

export const metadata: Metadata = { title: "New question" };
export const dynamic = "force-dynamic";

export default async function NewQuestionPage() {
  await requirePermission("question:write");

  const activeCount = await prisma.question.count({ where: { isActive: true } });

  return (
    <div className="space-y-4">
      <Link
        href="/admin/questions"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to questions
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Create a question</CardTitle>
          <CardDescription>New questions are added to the end of the order.</CardDescription>
        </CardHeader>
        <CardContent>
          <QuestionForm
            action={createQuestion}
            submitLabel="Create question"
            activeCount={activeCount}
            activeCap={FEEDBACK_QUESTION_COUNT}
          />
        </CardContent>
      </Card>
    </div>
  );
}
