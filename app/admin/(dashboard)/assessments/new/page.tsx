import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requirePermission } from "@/lib/modules/identity/server";
import { createAssessmentAction } from "@/lib/modules/assessments/actions";
import { AssessmentDetailsForm } from "@/components/admin/assessment-details-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "New assessment" };
export const dynamic = "force-dynamic";

export default async function NewAssessmentPage() {
  await requirePermission("assessment:write");

  return (
    <div className="max-w-xl space-y-4">
      <Link
        href="/admin/assessments/all"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to assessments
      </Link>

      <Card className="overflow-hidden py-0">
        <div className="h-2 bg-primary" />
        <CardHeader className="pt-6">
          <CardTitle className="font-heading text-xl">New assessment</CardTitle>
          <CardDescription>
            Starts as a draft. Add sections and questions, then publish. Publishing freezes
            the questions and the scoring so everybody sits the same thing.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          <AssessmentDetailsForm action={createAssessmentAction} submitLabel="Create draft" />
        </CardContent>
      </Card>
    </div>
  );
}
