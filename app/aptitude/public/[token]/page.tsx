import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight, Timer } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { getPublicAptitudeTest, hashInvitationToken } from "@/lib/modules/aptitude/server";
import { startPublicAptitudeTestAction } from "@/lib/modules/aptitude/actions";
import { IdentityDeclaration } from "@/components/aptitude/identity-declaration";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Aptitude test",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function PublicAptitudeTestEntryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const decodedToken = decodeURIComponent(token);
  const outcome = await getPublicAptitudeTest(decodedToken);

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

  const { test } = outcome;

  // Check if this browser already has an active, unsubmitted attempt
  const cookieStore = await cookies();
  const activeToken = cookieStore.get(`aptitude_active_${test.id}`)?.value;
  let hasActiveAttempt = false;

  if (activeToken) {
    const existing = await prisma.aptitudeInvitation.findUnique({
      where: { tokenHash: hashInvitationToken(activeToken) },
      select: {
        revokedAt: true,
        attempt: {
          select: {
            submittedAt: true,
            deadlineAt: true,
          },
        },
      },
    });

    if (
      existing &&
      !existing.revokedAt &&
      existing.attempt &&
      !existing.attempt.submittedAt &&
      (!existing.attempt.deadlineAt || existing.attempt.deadlineAt > new Date())
    ) {
      hasActiveAttempt = true;
    }
  }

  return (
    <main className="min-h-screen bg-secondary/40 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <Logo />

        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">{test.title}</h1>
          {test.description && <p className="mt-1 text-sm text-muted-foreground">{test.description}</p>}
        </div>

        {hasActiveAttempt && activeToken && (
          <Alert className="border-primary/40 bg-primary/5">
            <Timer className="size-4 text-primary" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
              <div>
                <AlertTitle className="text-sm font-semibold">Test in progress</AlertTitle>
                <AlertDescription className="text-xs text-muted-foreground">
                  You already have an active session for this test.
                </AlertDescription>
              </div>
              <Link
                href={`/aptitude/${encodeURIComponent(activeToken)}`}
                className={cn(buttonVariants({ size: "sm" }), "gap-1.5 shrink-0")}
              >
                Resume test
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </Alert>
        )}

        <IdentityDeclaration
          action={startPublicAptitudeTestAction.bind(null, decodedToken)}
          nameMode={test.identity.nameMode}
          emailMode={test.identity.emailMode}
          personal={false}
          timeLimitMinutes={test.timeLimitMinutes}
          isSectionTimed={test.isSectionTimed}
        />
      </div>
    </main>
  );
}
