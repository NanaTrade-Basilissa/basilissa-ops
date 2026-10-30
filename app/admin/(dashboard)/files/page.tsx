import { Metadata } from "next";
import { FolderUp, Globe, Lock, HardDrive } from "lucide-react";
import { requirePermission, can } from "@/lib/modules/identity/server";
import { listHostedFiles } from "@/lib/modules/files/server";
import { StatCard } from "@/components/admin/stat-card";
import { FilesManagementClient } from "@/components/admin/files/files-management-client";

export const metadata: Metadata = {
  title: "Hosted Files",
  description: "Dashboard file hosting with access control, custom slugs, and progressive viewer.",
};

function formatStorage(bytes: number): string {
  if (bytes === 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb > 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

export default async function AdminFilesPage() {
  const actor = await requirePermission("files:read");
  const canWrite = can(actor, "files:write");

  const { files, total } = await listHostedFiles();

  const publicCount = files.filter((f) => f.isPublic).length;
  const privateCount = files.filter((f) => !f.isPublic).length;
  const totalStorage = files.reduce(
    (acc, f) => acc + f.fileSize + (f.lowResSize || 0),
    0
  );
  const totalViews = files.reduce((acc, f) => acc + f.viewsCount, 0);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          Hosted Files
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Zero-trust file hosting with custom vanity URLs, display modes, and progressive dual-resolution in-app viewing.
        </p>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatCard
          label="Total Files"
          value={total}
          icon={FolderUp}
          subtext="Active assets in storage"
        />
        <StatCard
          label="Public Links"
          value={publicCount}
          icon={Globe}
          tone="good"
          subtext="Live with vanity slugs"
        />
        <StatCard
          label="Private Files"
          value={privateCount}
          icon={Lock}
          tone="info"
          subtext="Restricted to admins"
        />
        <StatCard
          label="Storage & Views"
          value={formatStorage(totalStorage)}
          icon={HardDrive}
          tone="brand"
          subtext={`${totalViews} total views tracked`}
        />
      </div>

      {/* Main Files Client Management Table */}
      <FilesManagementClient initialFiles={files} canWrite={canWrite} />
    </div>
  );
}
