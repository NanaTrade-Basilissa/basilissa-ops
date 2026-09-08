import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronLeft, Timer, TriangleAlert, X } from "lucide-react";
import { requirePermission } from "@/lib/modules/identity/server";
import { requireFeature } from "@/lib/platform/features-guard";
import { getAttemptDetail } from "@/lib/modules/aptitude/server";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAccraDateTime } from "@/lib/platform/date";

export const metadata: Metadata = { title: "Result" };
export const dynamic = "force-dynamic";

export default async function AptitudeAttemptPage({
  params,
}: {
  params: Promise<{ id: string; attemptId: string }>;
}) {
  requireFeature("aptitude");
  await requirePermission("aptitude:read");
  const { id, attemptId } = await params;

  const attempt = await getAttemptDetail(attemptId);
  if (!attempt || attempt.invitation.test.id !== id) notFound();

  const percent =
    (attempt.maxPoints ?? 0) > 0 ? Math.round((attempt.scoredPoints! / attempt.maxPoints!) * 100) : null;
  const passMark = attempt.invitation.test.passMarkPercent;

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href={`/admin/aptitude-tests/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to the test
      </Link>

      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">{attempt.invitation.candidateName}</h1>
        <p className="text-sm text-muted-foreground">
          {attempt.invitation.test.title}
          {attempt.submittedAt ? ` · submitted ${formatAccraDateTime(attempt.submittedAt)}` : " · not submitted"}
        </p>
      </div>

      {attempt.autoSubmitted && (
        <Alert>
          <Timer className="size-4" />
          <AlertTitle>Submitted automatically when time ran out</AlertTitle>
          <AlertDescription>
            The candidate did not click submit themselves — this was finalised once the test&rsquo;s
            timer reached zero, scoring whatever had been answered up to that point.
          </AlertDescription>
        </Alert>
      )}

      {attempt.identityMismatch && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertTitle>The name typed did not match the invitation</AlertTitle>
          <AlertDescription>
            Sent to <strong>{attempt.invitation.candidateName}</strong>; the person answering typed{" "}
            <strong>{attempt.declaredName}</strong>
            {attempt.declaredEmail && <> ({attempt.declaredEmail})</>}. The link was still valid, so the answers were
            recorded. Worth asking about before using this result.
          </AlertDescription>
        </Alert>
      )}

      {attempt.submittedAt && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score</CardTitle>
            <CardDescription>Recorded at submission. It does not change if the test is edited afterwards.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {attempt.scoredPoints} / {attempt.maxPoints}
            </p>
            {percent !== null && (
              <p className="text-muted-foreground">
                {percent}%
                {passMark !== null && (
                  <>
                    {" · "}
                    <span className={percent >= passMark ? "" : "text-destructive"}>
                      {percent >= passMark ? "at or above" : "below"} the {passMark}% pass mark
                    </span>
                  </>
                )}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {attempt.sections.map((section) => (
        <Card key={section.id}>
          <CardHeader>
            <CardTitle className="text-base">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {section.questions.map((question, index) => (
              <div key={question.id} className="space-y-2 text-sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium">
                    {index + 1}. {question.text}
                  </span>
                  {question.possiblePoints !== null && question.possiblePoints > 0 && (
                    <Badge variant={question.awardedPoints === question.possiblePoints ? "default" : "outline"} className="text-xs">
                      {question.awardedPoints}/{question.possiblePoints}
                    </Badge>
                  )}
                  {!question.answered && (
                    <Badge variant="outline" className="text-xs">
                      not answered
                    </Badge>
                  )}
                </div>

                {question.kind === "FREE_TEXT" ? (
                  <div className="rounded-lg bg-muted/40 p-3">
                    {question.writtenAnswer ? (
                      <p className="whitespace-pre-wrap">{question.writtenAnswer}</p>
                    ) : (
                      <p className="text-muted-foreground">Nothing written.</p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">Not scored, for you to read.</p>
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {question.options.map((option) => (
                      <li
                        key={option.id}
                        className="flex items-start gap-2 rounded-md px-2 py-1 data-chosen:bg-muted/40"
                        data-chosen={option.chosen ? "" : undefined}
                      >
                        <span className="mt-0.5 w-4 shrink-0">
                          {option.isCorrect && <Check className="size-4" />}
                          {option.chosen && !option.isCorrect && <X className="size-4 text-destructive" />}
                        </span>
                        <span className={option.chosen ? "font-medium" : "text-muted-foreground"}>
                          {option.text}
                          {option.chosen && <span className="ml-1.5 text-xs text-muted-foreground">(chosen)</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
