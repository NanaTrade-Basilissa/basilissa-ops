import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { FEEDBACK_QUESTION_COUNT } from "@/lib/modules/feedback/constants";
import { buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { QuestionsTable } from "@/components/admin/questions-table";
import { requirePermission } from "@/lib/modules/identity/server";

export const metadata: Metadata = { title: "Questions" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function QuestionsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission("question:read");

  const { error } = await searchParams;
  const questions = await prisma.question.findMany({ orderBy: { order: "asc" } });
  const activeCount = questions.filter((q) => q.isActive).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Questions</h1>
          <p className="text-sm text-muted-foreground">
            The fixed rating questions shown to customers, in order. Exactly{" "}
            {FEEDBACK_QUESTION_COUNT} must be active for the feedback form to work.
          </p>
        </div>
        <Link href="/admin/questions/new" className={buttonVariants({ variant: "default" })}>
          <Plus className="size-4" /> New question
        </Link>
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
