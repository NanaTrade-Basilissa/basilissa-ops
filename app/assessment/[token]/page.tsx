import type { Metadata } from "next";
import { loadForTaking } from "@/lib/modules/assessments/server";
import {
  declareIdentityAction,
  saveAnswerAction,
  submitAssessmentAction,
} from "@/lib/modules/assessments/actions";
import { AssessmentRunner } from "@/components/assessment/assessment-runner";
import { IdentityDeclaration } from "@/components/assessment/identity-declaration";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Assessment",
  // A link that lands in a search index is a link anybody can sit.
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function TakeAssessmentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const outcome = await loadForTaking(decodeURIComponent(token));

  if (!outcome.ok) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-secondary/40 px-4">
        <div className="mb-8">
          <Logo size="lg" />
        </div>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl">
              {outcome.reason === "ALREADY_SUBMITTED" ? "Already completed" : "This link cannot be used"}
            </CardTitle>
            <CardDescription>{outcome.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {outcome.reason === "ALREADY_SUBMITTED"
                ? "Your answers were recorded. There is nothing else to do."
                : "If you think this is a mistake, ask whoever sent it to you for a new link."}
            </p>
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
          <h1 className="font-heading text-2xl font-bold text-foreground">
            {view.assessmentTitle}
          </h1>
          {view.assessmentDescription && (
            <p className="mt-1 text-sm text-muted-foreground">{view.assessmentDescription}</p>
          )}
        </div>

        {/*
          Identity first, and it gates the questions. The token already says who
          this is — this is a declaration, recorded and compared. Asking after
          the answers were given would make it feel like a formality.
        */}
        {view.declaredName === null ? (
          <IdentityDeclaration
            action={declareIdentityAction.bind(null, decodeURIComponent(token))}
          />
        ) : (
          <AssessmentRunner
            sections={view.sections}
            declaredName={view.declaredName}
            saveAction={saveAnswerAction.bind(null, decodeURIComponent(token))}
            submitAction={submitAssessmentAction.bind(null, decodeURIComponent(token))}
          />
        )}
      </div>
    </main>
  );
}
