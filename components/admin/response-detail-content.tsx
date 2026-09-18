import { Check, TriangleAlert, X } from "lucide-react";
import type { getResponseDetail } from "@/lib/modules/assessments/server";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAccraDateTime } from "@/lib/platform/date";

/**
 * The actual answers-vs-key rendering, shared by the full page
 * (`assessments/[id]/responses/[responseId]`, kept for a direct link) and the
 * Sheet opened from the invite list — same content, two ways to reach it.
 */
export function ResponseDetailContent({
  response,
}: {
  response: NonNullable<Awaited<ReturnType<typeof getResponseDetail>>>;
}) {
  const percent =
    (response.maxPoints ?? 0) > 0
      ? Math.round((response.scoredPoints! / response.maxPoints!) * 100)
      : null;
  const passMark = response.invitation.assessment.passMarkPercent;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl font-bold text-foreground">
          {response.invitation.inviteeName}
        </h2>
        <p className="text-sm text-muted-foreground">
          {response.invitation.assessment.title}
          {response.submittedAt
            ? ` · submitted ${formatAccraDateTime(response.submittedAt)}`
            : " · not submitted"}
        </p>
      </div>

      {response.identityMismatch && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertTitle>The name typed did not match the invitation</AlertTitle>
          <AlertDescription>
            Sent to <strong>{response.invitation.inviteeName}</strong>; the person answering
            typed <strong>{response.declaredName}</strong>
            {response.declaredEmail && <> ({response.declaredEmail})</>}. The link was still
            valid, so the answers were recorded. Worth asking about before using this result.
          </AlertDescription>
        </Alert>
      )}

      {response.submittedAt && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score</CardTitle>
            <CardDescription className="text-xs">
              Submission score record.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {response.scoredPoints} / {response.maxPoints}
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

      {response.sections.map((section) => (
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
                    <Badge
                      variant={
                        question.awardedPoints === question.possiblePoints ? "default" : "outline"
                      }
                      className="text-xs"
                    >
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
                    <p className="mt-2 text-xs text-muted-foreground">
                      Not scored, for you to read.
                    </p>
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
                          {option.chosen && !option.isCorrect && (
                            <X className="size-4 text-destructive" />
                          )}
                        </span>
                        <span
                          className={
                            option.chosen ? "font-medium" : "text-muted-foreground"
                          }
                        >
                          {option.text}
                          {option.chosen && (
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              (chosen)
                            </span>
                          )}
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
