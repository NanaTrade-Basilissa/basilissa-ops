import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { hashInvitationToken } from "@/lib/modules/assessments/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Thank you",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function AssessmentDonePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  /*
    Read directly rather than through loadForTaking, which refuses a submitted
    attempt — correctly, since it exists to serve the questions. What this page
    needs is the opposite: the result of an attempt that IS submitted.

    Only the totals, the pass mark and the visibility flag are selected. No
    options, no correctness, nothing about which answers were right.
  */
  const invitation = await prisma.assessmentInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(decodeURIComponent(token)) },
    select: {
      inviteeName: true,
      assessment: { select: { id: true, title: true, showScoreToTaker: true, passMarkPercent: true } },
      response: { select: { submittedAt: true, scoredPoints: true, maxPoints: true } },
    },
  });

  const linkedCourse = invitation
    ? await prisma.trainingCourse.findFirst({
        where: { quizAssessmentId: invitation.assessment.id },
        select: { id: true, title: true, passScorePercent: true },
      })
    : null;

  const submitted = invitation?.response?.submittedAt ?? null;
  const showScore =
    (invitation?.assessment.showScoreToTaker === true || Boolean(linkedCourse)) &&
    submitted !== null &&
    (invitation?.response?.maxPoints ?? 0) > 0;

  const percent = showScore
    ? Math.round((invitation!.response!.scoredPoints! / invitation!.response!.maxPoints!) * 100)
    : null;

  const passMark = showScore
    ? linkedCourse?.passScorePercent ?? invitation!.assessment.passMarkPercent
    : null;
  const passed = passMark !== null && percent !== null ? percent >= passMark : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-secondary/40 px-4">
      <div className="mb-8">
        <Logo size="lg" />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <CheckCircle2 className="size-5" />
            {submitted ? "Thank you" : "Nothing to show"}
          </CardTitle>
          <CardDescription>
            {submitted
              ? `Your answers to “${invitation!.assessment.title}” have been recorded.`
              : "This link has no completed assessment against it."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {submitted && (
            <>
              {showScore ? (
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="text-2xl font-bold text-foreground">
                    {invitation!.response!.scoredPoints} / {invitation!.response!.maxPoints}
                  </p>
                  <p className="text-muted-foreground">
                    {percent}%
                    {passed !== null && (
                      <span className={passed ? "" : "text-destructive"}>
                        {" · "}
                        {passed ? "Passed" : "Not passed"}, {passMark}% needed
                      </span>
                    )}
                  </p>
                </div>
              ) : (
                /*
                  The default. Scores are for HR unless the assessment says
                  otherwise — a visible score turns a diagnostic into an exam,
                  people compare, and the honest answers stop arriving.
                */
                <p className="text-muted-foreground">
                  Your score is not shown here. Whoever sent this to you can discuss it with
                  you if that is useful.
                </p>
              )}
              {linkedCourse && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-primary font-medium">
                  🎓 Result synced with your course "{linkedCourse.title}". You can now return to your Basilissa Employee App.
                </div>
              )}
              <p className="text-muted-foreground">
                You can close this page. The link will not work again.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
