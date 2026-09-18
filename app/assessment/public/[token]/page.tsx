import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight, Timer } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { getPublicAssessment, hashInvitationToken } from "@/lib/modules/assessments/server";
import { startPublicAssessmentAction } from "@/lib/modules/assessments/actions";
import { IdentityDeclaration } from "@/components/assessment/identity-declaration";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Assessment",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function PublicAssessmentEntryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const decodedToken = decodeURIComponent(token);
  const outcome = await getPublicAssessment(decodedToken);

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

  const { assessment } = outcome;

  // Check if this browser already has an active, unsubmitted attempt
  const cookieStore = await cookies();
  const activeToken = cookieStore.get(`assessment_active_${assessment.id}`)?.value;
  let hasActiveAttempt = false;

  if (activeToken) {
    const existing = await prisma.assessmentInvitation.findUnique({
      where: { tokenHash: hashInvitationToken(activeToken) },
      select: {
        revokedAt: true,
        response: {
          select: {
            submittedAt: true,
          },
        },
      },
    });

    if (
      existing &&
      !existing.revokedAt &&
      existing.response &&
      !existing.response.submittedAt
    ) {
      hasActiveAttempt = true;
    }
  }

  return (
    <main className="min-h-screen bg-secondary/40 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <Logo />

        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">
            {assessment.title}
          </h1>
          {assessment.description && (
            <p className="mt-1 text-sm text-muted-foreground">{assessment.description}</p>
          )}
        </div>

        {hasActiveAttempt && activeToken && (
          <Alert className="border-primary/40 bg-primary/5">
            <Timer className="size-4 text-primary" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
              <div>
                <AlertTitle className="text-sm font-semibold">Assessment in progress</AlertTitle>
                <AlertDescription className="text-xs text-muted-foreground">
                  You already have an active session for this assessment.
                </AlertDescription>
              </div>
              <Link
                href={`/assessment/${encodeURIComponent(activeToken)}`}
                className={cn(buttonVariants({ size: "sm" }), "gap-1.5 shrink-0")}
              >
                Resume assessment
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </Alert>
        )}

        <IdentityDeclaration
          action={startPublicAssessmentAction.bind(null, decodedToken)}
          nameMode={assessment.identity.nameMode}
          emailMode={assessment.identity.emailMode}
          personal={false}
        />
      </div>
    </main>
  );
}
