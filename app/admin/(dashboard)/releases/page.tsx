import type { Metadata } from "next";
import { can, requirePermission } from "@/lib/modules/identity/server";
import { listReleases } from "@/lib/modules/releases/server";
import { ReleasesPanel } from "@/components/admin/releases-panel";

export const metadata: Metadata = { title: "App releases" };
export const dynamic = "force-dynamic";

/**
 * Mobile app releases. Recording one is what tells installed apps an update
 * exists, and a Required one blocks old builds, so the Server Action re-checks
 * `releases:manage` itself.
 */
export default async function ReleasesPage() {
  const actor = await requirePermission("releases:read");
  const releases = await listReleases();
  return <ReleasesPanel releases={releases} canManage={can(actor, "releases:manage")} />;
}
