import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ name?: string; phone?: string; courseId?: string }>;
}) {
  const [{ token }, search] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { name?: string; phone?: string; courseId?: string }),
  ]);
  const decodedToken = decodeURIComponent(token);
  const outcome = await getPublicAssessment(decodedToken);
  const defaultName = search?.name ? decodeURIComponent(search.name) : undefined;
  const defaultPhone = search?.phone ? decodeURIComponent(search.phone) : undefined;
  const courseId = search?.courseId ? decodeURIComponent(search.courseId) : undefined;

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

  // Check if this browser or employee already has an active, unsubmitted attempt
  const cookieStore = await cookies();
  const activeToken = cookieStore.get(`assessment_active_${assessment.id}`)?.value;
  let resumeToken: string | null = null;

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
      resumeToken = activeToken;
    }
  }

  if (!resumeToken && defaultPhone && courseId) {
    const cleanDigits = defaultPhone.replace(/\D/g, "");
    const possible = [
      defaultPhone,
      cleanDigits,
      cleanDigits.startsWith("233") ? "0" + cleanDigits.slice(3) : cleanDigits,
      cleanDigits.startsWith("0") ? "233" + cleanDigits.slice(1) : cleanDigits,
    ];
    const emp = await prisma.employee.findFirst({
      where: { phone: { in: possible } },
      select: { id: true },
    });
    if (emp) {
      const assignment = await prisma.trainingAssignment.findUnique({
        where: { courseId_employeeId: { courseId, employeeId: emp.id } },
        select: { quizAttemptToken: true },
      });
      if (assignment?.quizAttemptToken) {
        const existing = await prisma.assessmentInvitation.findUnique({
          where: { tokenHash: hashInvitationToken(assignment.quizAttemptToken) },
          select: {
            revokedAt: true,
            response: { select: { submittedAt: true } },
          },
        });
        if (existing && !existing.revokedAt && existing.response && !existing.response.submittedAt) {
          resumeToken = assignment.quizAttemptToken;
        }
      }
    }
  }

  if (resumeToken) {
    redirect(`/assessment/${encodeURIComponent(resumeToken)}`);
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

        <IdentityDeclaration
          action={startPublicAssessmentAction.bind(null, decodedToken)}
          nameMode={assessment.identity.nameMode}
          emailMode={assessment.identity.emailMode}
          personal={false}
          defaultName={defaultName}
          defaultPhone={defaultPhone}
          courseId={courseId}
        />
      </div>
    </main>
  );
}
