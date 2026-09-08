import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requirePermission } from "@/lib/modules/identity/server";
import { requireFeature } from "@/lib/platform/features-guard";
import { createAptitudeTestAction } from "@/lib/modules/aptitude/actions";
import { AptitudeTestDetailsForm } from "@/components/admin/aptitude-test-details-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "New aptitude test" };
export const dynamic = "force-dynamic";

export default async function NewAptitudeTestPage() {
  requireFeature("aptitude");
  await requirePermission("aptitude:write");

  return (
    <div className="max-w-xl space-y-4">
      <Link
        href="/admin/aptitude-tests/all"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to aptitude tests
      </Link>

      <Card className="overflow-hidden py-0">
        <div className="h-2 bg-primary" />
        <CardHeader className="pt-6">
          <CardTitle className="font-heading text-xl">New aptitude test</CardTitle>
          <CardDescription>
            Starts as a draft. Add sections and questions, then publish. Publishing freezes the
            questions and the scoring so every candidate sits the same thing. Timing and links
            are set up afterward, from the test&rsquo;s own page.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          <AptitudeTestDetailsForm action={createAptitudeTestAction} submitLabel="Create draft" />
        </CardContent>
      </Card>
    </div>
  );
}
