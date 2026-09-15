import type { Metadata } from "next";
import { loadForTaking } from "@/lib/modules/aptitude/server";
import {
  declareIdentityAction,
  recordTabAbsenceAction,
  saveAnswerAction,
  submitAptitudeTestAction,
} from "@/lib/modules/aptitude/actions";
import { AptitudeRunner } from "@/components/aptitude/aptitude-runner";
import { IdentityDeclaration } from "@/components/aptitude/identity-declaration";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Aptitude test",
  // A link that lands in a search index is a link anybody can sit.
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function TakeAptitudeTestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const outcome = await loadForTaking(decodeURIComponent(token));

  if (!outcome.ok) {
    const title =
      outcome.reason === "ALREADY_SUBMITTED"
        ? "Already completed"
        : outcome.reason === "TIME_UP"
          ? "Time ran out"
          : "This link cannot be used";
    const explanation =
      outcome.reason === "ALREADY_SUBMITTED" || outcome.reason === "TIME_UP"
        ? "Your answers were recorded. There is nothing else to do."
        : "If you think this is a mistake, ask whoever sent it to you for a new link";

    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-secondary/40 px-4">
        <div className="mb-8">
          <Logo size="lg" />
        </div>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription>{outcome.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{explanation}</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const { view } = outcome;

  return (
    <main className="min-h-screen bg-secondary/40 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <Logo />

        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">{view.testTitle}</h1>
          {view.testDescription && <p className="mt-1 text-sm text-muted-foreground">{view.testDescription}</p>}
        </div>

        {view.declaredName === null ? (
          <IdentityDeclaration
            action={declareIdentityAction.bind(null, decodeURIComponent(token))}
            nameMode={view.identity.nameMode}
            emailMode={view.identity.emailMode}
            personal={!view.isPublic}
            timeLimitMinutes={view.timeLimitMinutes}
          />
        ) : (
          <AptitudeRunner
            sections={view.sections}
            declaredName={view.declaredName}
            deadlineAt={view.deadlineAt}
            saveAction={saveAnswerAction.bind(null, decodeURIComponent(token))}
            submitAction={submitAptitudeTestAction.bind(null, decodeURIComponent(token))}
            recordAbsenceAction={recordTabAbsenceAction.bind(null, decodeURIComponent(token))}
          />
        )}
      </div>
    </main>
  );
}
