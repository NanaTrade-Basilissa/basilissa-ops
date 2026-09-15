import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requirePermission } from "@/lib/modules/identity/server";
import { getAttemptDetail } from "@/lib/modules/aptitude/server";
import { AttemptDetailContent } from "@/components/admin/attempt-detail-content";

export const metadata: Metadata = { title: "Result" };
export const dynamic = "force-dynamic";

export default async function AptitudeAttemptPage({
  params,
}: {
  params: Promise<{ id: string; attemptId: string }>;
}) {
  await requirePermission("aptitude:read");
  const { id, attemptId } = await params;

  const attempt = await getAttemptDetail(attemptId);
  if (!attempt || attempt.invitation.test.id !== id) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/admin/aptitude-tests/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to the test
      </Link>

      <AttemptDetailContent attempt={attempt} />
    </div>
  );
}
