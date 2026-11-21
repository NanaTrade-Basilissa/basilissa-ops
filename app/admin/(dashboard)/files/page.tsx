import { Metadata } from "next";
import { requirePermission, can } from "@/lib/modules/identity/server";
import { listHostedFiles } from "@/lib/modules/files/server";
import { FilesManagementClient } from "@/components/admin/files/files-management-client";

export const metadata: Metadata = {
  title: "Hosted Files",
  description: "Dashboard file hosting with access control, custom slugs, and progressive viewer.",
};

export default async function AdminFilesPage() {
  const actor = await requirePermission("files:read");
  const canWrite = can(actor, "files:write");

  const { files } = await listHostedFiles();

  return <FilesManagementClient initialFiles={files} canWrite={canWrite} />;
}
