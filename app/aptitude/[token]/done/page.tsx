import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { requireFeature } from "@/lib/platform/features-guard";
import { prisma } from "@/lib/platform/prisma";
import { hashInvitationToken } from "@/lib/modules/aptitude/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Thank you",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function AptitudeTestDonePage({ params }: { params: Promise<{ token: string }> }) {
  requireFeature("aptitude");
  const { token } = await params;

  /*
    Read directly rather than through loadForTaking, which refuses a
    submitted attempt. Only the totals, the pass mark and the visibility
    flag are selected — no options, no correctness.
  */
  const invitation = await prisma.aptitudeInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(decodeURIComponent(token)) },
    select: {
      candidateName: true,
      test: { select: { title: true, showScoreToCandidate: true, passMarkPercent: true } },
      attempt: { select: { submittedAt: true, autoSubmitted: true, scoredPoints: true, maxPoints: true } },
    },
  });

  const submitted = invitation?.attempt?.submittedAt ?? null;
  const showScore =
    invitation?.test.showScoreToCandidate === true && submitted !== null && (invitation.attempt?.maxPoints ?? 0) > 0;

  const percent = showScore
    ? Math.round((invitation!.attempt!.scoredPoints! / invitation!.attempt!.maxPoints!) * 100)
    : null;

  const passMark = showScore ? invitation!.test.passMarkPercent : null;
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
              ? `Your answers to “${invitation!.test.title}” have been recorded.`
              : "This link has no completed test against it."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {submitted && (
            <>
              {invitation!.attempt!.autoSubmitted && (
                <p className="text-muted-foreground">
                  This was submitted automatically once time ran out, with whatever you had
                  answered up to that point.
                </p>
              )}
              {showScore ? (
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="text-2xl font-bold text-foreground">
                    {invitation!.attempt!.scoredPoints} / {invitation!.attempt!.maxPoints}
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
                <p className="text-muted-foreground">
                  Your score is not shown here. Whoever sent this to you can discuss it with you
                  if that is useful.
                </p>
              )}
              <p className="text-muted-foreground">You can close this page. The link will not work again.</p>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
