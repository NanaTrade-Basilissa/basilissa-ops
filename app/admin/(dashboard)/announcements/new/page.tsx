import type { Metadata } from "next";
import { requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { loadComposeOptions } from "@/lib/modules/announcements/server";
import { AnnouncementComposer } from "@/components/admin/announcement-composer";
import { PageHeader, PageShell } from "@/components/admin/page-shell";

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
    <PageShell>
      <PageHeader
        backHref="/admin/announcements"
        backLabel="Announcements"
        title="New announcement"
        description="Compose and deliver a message or urgent banner to selected branches and staff."
      />
      <AnnouncementComposer options={options} />
    </PageShell>
  );
}
