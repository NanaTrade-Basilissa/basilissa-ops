import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { startPublicAttempt } from "@/lib/modules/assessments/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Assessment",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * The public link's entry point. Not a taking page itself — it mints an
 * ordinary invitation for whoever just opened it (see `startPublicAttempt`)
 * and hands off to the same per-invitation flow every personal link uses, so
 * there is exactly one taking implementation, not two.
 *
 * A fresh attempt on every visit, deliberately: there is no session here, so
 * "the same person opened it twice" and "two different people opened it"
 * look identical, and are treated the same way — two attempts.
 */
export default async function PublicAssessmentEntryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const outcome = await startPublicAttempt(decodeURIComponent(token));

  if (!outcome.ok) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-secondary/40 px-4">
        <div className="mb-8">
          <Logo size="lg" />
        </div>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl">This link cannot be used</CardTitle>
            <CardDescription>{outcome.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              If you think this is a mistake, ask whoever shared it with you to check it.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  redirect(`/assessment/${encodeURIComponent(outcome.token)}`);
}
