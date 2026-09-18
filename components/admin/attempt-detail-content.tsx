import { Check, LogOut, Timer, TriangleAlert, X } from "lucide-react";
import type { getAttemptDetail, TabAbsence } from "@/lib/modules/aptitude/server";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAccraDateTime } from "@/lib/platform/date";
import { cn } from "@/lib/utils";

/** Below this, an absence reads as a glance away, not a real gap — long
 * enough that copy/paste being blocked already makes it hard to have done
 * much with it. At or above, it's called out for HR to weigh. */
const NOTABLE_ABSENCE_MS = 30_000;

function formatAbsenceDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

/**
 * The actual answers-vs-key rendering, shared by the full page
 * (`aptitude-tests/[id]/attempts/[attemptId]`, kept for a direct link) and
 * the Sheet opened from the invite list — same content, two ways to reach it.
 */
export function AttemptDetailContent({
  attempt,
}: {
  attempt: NonNullable<Awaited<ReturnType<typeof getAttemptDetail>>>;
}) {
  const percent =
    (attempt.maxPoints ?? 0) > 0 ? Math.round((attempt.scoredPoints! / attempt.maxPoints!) * 100) : null;
  const passMark = attempt.invitation.test.passMarkPercent;
  const tabAbsences = (Array.isArray(attempt.tabAbsences) ? attempt.tabAbsences : []) as TabAbsence[];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl font-bold text-foreground">{attempt.invitation.candidateName}</h2>
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

      {tabAbsences.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Left the test tab</CardTitle>
            <CardDescription className="text-xs">
              Logged browser tab switch events.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {tabAbsences.map((absence, index) => {
                const notable = absence.durationMs >= NOTABLE_ABSENCE_MS;
                return (
                  <li
                    key={index}
                    className={cn(
                      "flex items-center gap-2",
                      notable ? "font-medium text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {notable ? (
                      <TriangleAlert className="size-3.5 shrink-0" />
                    ) : (
                      <LogOut className="size-3.5 shrink-0" />
                    )}
                    {formatAccraDateTime(new Date(absence.leftAt))} · away for{" "}
                    {formatAbsenceDuration(absence.durationMs)}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {attempt.submittedAt && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score</CardTitle>
            <CardDescription className="text-xs">Submission score record.</CardDescription>
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
