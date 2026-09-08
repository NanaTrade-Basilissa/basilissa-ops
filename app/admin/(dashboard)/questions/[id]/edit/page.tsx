import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { updateQuestion } from "@/lib/modules/questions/actions";
import { FEEDBACK_QUESTION_COUNT } from "@/lib/modules/feedback/constants";
import { QuestionForm } from "@/components/admin/question-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requirePermission } from "@/lib/modules/identity/server";

export const metadata: Metadata = { title: "Edit question" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function EditQuestionPage({ params }: { params: Params }) {
  await requirePermission("question:write");

  const { id } = await params;
  const question = await prisma.question.findUnique({ where: { id } });
  if (!question) notFound();

  const activeCount = await prisma.question.count({
    where: { isActive: true, id: { not: question.id } },
  });

  const boundUpdateQuestion = updateQuestion.bind(null, question.id);

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
          <CardTitle>Edit question</CardTitle>
          <CardDescription>Editing the text does not affect past feedback answers.</CardDescription>
        </CardHeader>
        <CardContent>
          <QuestionForm
            action={boundUpdateQuestion}
            submitLabel="Save changes"
            defaultValues={{
              text: question.text,
              isActive: question.isActive,
              ratingLabels: question.ratingLabels,
            }}
            activeCount={activeCount}
            activeCap={FEEDBACK_QUESTION_COUNT}
          />
        </CardContent>
      </Card>
    </div>
  );
}
