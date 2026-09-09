import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requirePermission } from "@/lib/modules/identity/server";
import { getUserDetailAction } from "@/lib/modules/identity/actions";
import { UserDetailContent } from "@/components/admin/user-detail-content";

export const metadata: Metadata = { title: "User" };
export const dynamic = "force-dynamic";

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Also re-checked inside getUserDetailAction, since that's reachable from
  // the Sheet too — this call is what keeps this PAGE from ever relying on
  // the layout (or on the action) for its own protection.
  await requirePermission("user:read");
  const { id } = await params;
  const detail = await getUserDetailAction(id);
  if (!detail) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to users
      </Link>

      <UserDetailContent
        user={detail.user}
        canWrite={detail.canWrite}
        canAssign={detail.canAssign}
        roles={detail.roles}
        branches={detail.branches}
        active={detail.active}
        revoked={detail.revoked}
        isSelf={detail.isSelf}
        emailConfigured={detail.emailConfigured}
      />
    </div>
  );
}
