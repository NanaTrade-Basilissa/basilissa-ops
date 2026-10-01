import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCheck, ChevronLeft, Smartphone, Users } from "lucide-react";
import { requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { getAnnouncementDetail } from "@/lib/modules/announcements/server";
import { AUDIENCE_LABELS } from "@/lib/modules/announcements/constants";
import { AnnouncementRecipientsTable } from "@/components/admin/announcement-recipients-table";
import { formatSent } from "@/components/admin/announcement-format";
import { StatCard } from "@/components/admin/stat-card";

export const metadata: Metadata = { title: "Announcement" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

/**
 * One announcement and who it went to. Not found, rather than forbidden, when it
 * is not the viewer's to see, so ids cannot be probed.
 */
export default async function AnnouncementDetailPage({ params }: { params: Params }) {
  const { actor, scope } = await requireAnyBranchPermission("announcement:read");
  const { id } = await params;

  const detail = await getAnnouncementDetail(id, { userId: actor.userId, scope });
  if (!detail) notFound();

  const { counts } = detail;
  const readPercent = counts.recipients === 0 ? 0 : Math.round((counts.read / counts.recipients) * 100);

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
        <h1 className="text-lg font-semibold">{detail.title}</h1>
        <p className="text-sm text-muted-foreground">
          Sent {formatSent(detail.createdAt)} by {detail.createdByName} · {AUDIENCE_LABELS[detail.audienceKind].label}
        </p>
      </div>

      <div className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm">{detail.body}</div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sent to" value={counts.recipients} icon={Users} />
        <StatCard label="Read" value={`${counts.read} (${readPercent}%)`} icon={CheckCheck} />
        {detail.sendPush && <StatCard label="Push delivered" value={counts.pushSent} icon={Smartphone} tone="good" />}
        {detail.sendPush && <StatCard label="Push not delivered" value={counts.pushFailed + counts.pushUnreachable} icon={AlertTriangle} tone={counts.pushFailed > 0 ? "critical" : "default"} />}
      </div>

      <AnnouncementRecipientsTable rows={detail.recipients} showPush={detail.sendPush} />
    </div>
  );
}
