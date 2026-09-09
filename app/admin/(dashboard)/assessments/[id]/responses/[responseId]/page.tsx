import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requirePermission } from "@/lib/modules/identity/server";
import { getResponseDetail } from "@/lib/modules/assessments/server";
import { ResponseDetailContent } from "@/components/admin/response-detail-content";

export const metadata: Metadata = { title: "Result" };
export const dynamic = "force-dynamic";

export default async function ResponsePage({
  params,
}: {
  params: Promise<{ id: string; responseId: string }>;
}) {
  await requirePermission("assessment:read");
  const { id, responseId } = await params;

  const response = await getResponseDetail(responseId);
  if (!response || response.invitation.assessment.id !== id) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/admin/assessments/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to the assessment
      </Link>

      <ResponseDetailContent response={response} />
    </div>
  );
}
