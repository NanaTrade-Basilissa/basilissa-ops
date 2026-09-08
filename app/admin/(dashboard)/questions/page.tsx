import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { toggleQuestionActive, moveQuestion } from "@/lib/modules/questions/actions";
import { FEEDBACK_QUESTION_COUNT } from "@/lib/modules/feedback/constants";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

      <Card>
        <CardContent className="px-0 sm:px-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Order</TableHead>
                <TableHead>Question</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {questions.map((question, index) => (
                <TableRow key={question.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <form action={moveQuestion}>
                        <input type="hidden" name="id" value={question.id} />
                        <input type="hidden" name="direction" value="up" />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon-sm"
                          disabled={index === 0}
                          aria-label="Move up"
                        >
                          <ArrowUp className="size-3.5" />
                        </Button>
                      </form>
                      <form action={moveQuestion}>
                        <input type="hidden" name="id" value={question.id} />
                        <input type="hidden" name="direction" value="down" />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon-sm"
                          disabled={index === questions.length - 1}
                          aria-label="Move down"
                        >
                          <ArrowDown className="size-3.5" />
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{question.text}</TableCell>
                  <TableCell>
                    <Badge variant={question.isActive ? "default" : "outline"}>
                      {question.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      <Link
                        href={`/admin/questions/${question.id}/edit`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Edit
                      </Link>
                      <form action={toggleQuestionActive}>
                        <input type="hidden" name="id" value={question.id} />
                        <input type="hidden" name="nextIsActive" value={(!question.isActive).toString()} />
                        <Button
                          size="sm"
                          variant={question.isActive ? "destructive" : "secondary"}
                          type="submit"
                          disabled={!question.isActive && activeCount >= FEEDBACK_QUESTION_COUNT}
                        >
                          {question.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {questions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center text-sm text-muted-foreground">
                    No questions yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
