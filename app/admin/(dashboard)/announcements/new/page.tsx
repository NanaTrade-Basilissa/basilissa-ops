import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { loadComposeOptions } from "@/lib/modules/announcements/server";
import { AnnouncementComposer } from "@/components/admin/announcement-composer";

export const metadata: Metadata = { title: "New announcement" };
export const dynamic = "force-dynamic";

/**
 * The compose screen. It offers only the branches and people inside the
 * sender's scope; that is a convenience, and the Server Action checks the
 * audience against the scope again.
 */
export default async function NewAnnouncementPage() {
  const { scope } = await requireAnyBranchPermission("announcement:write");
  const options = await loadComposeOptions(scope);

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      <div className="space-y-1 border-b border-border pb-3">
        <Link
          href="/admin/announcements"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Announcements
        </Link>
        <h1 className="text-lg font-semibold">New announcement</h1>
      </div>
      <AnnouncementComposer options={options} />
    </div>
  );
}
