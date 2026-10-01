import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCheck, ChevronLeft, Smartphone, Users } from "lucide-react";
import { can, requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { clearUrgentBannerAction } from "@/lib/modules/announcements/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const canEndBanner = scope.kind === "all" && can(actor, "announcement:write");
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
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">{detail.title}</h1>
          {detail.isUrgent && (
            <Badge variant={detail.bannerActive ? "destructive" : "outline"}>
              {detail.bannerActive ? "Urgent, banner up" : "Urgent"}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Sent {formatSent(detail.createdAt)} by {detail.createdByName} · {AUDIENCE_LABELS[detail.audienceKind].label}
        </p>
      </div>

      {detail.bannerActive && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <span>
            This banner is showing in the app
            {detail.bannerExpiresAt ? ` until ${formatSent(detail.bannerExpiresAt)}` : ""}.
          </span>
          {canEndBanner && (
            <form action={clearUrgentBannerAction}>
              <input type="hidden" name="announcementId" value={detail.id} />
              <Button type="submit" variant="outline" size="sm">
                End banner now
              </Button>
            </form>
          )}
        </div>
      )}

      <div className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm">{detail.body}</div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sent to" value={counts.recipients} icon={Users} />
        <StatCard label="Read" value={`${counts.read} (${readPercent}%)`} icon={CheckCheck} />
        {detail.requiresAck && (
          <StatCard label="Confirmed" value={`${counts.acknowledged} of ${counts.recipients}`} icon={CheckCheck} tone={counts.acknowledged === counts.recipients ? "good" : "default"} />
        )}
        {detail.sendPush && <StatCard label="Push delivered" value={counts.pushSent} icon={Smartphone} tone="good" />}
        {detail.sendPush && <StatCard label="Push not delivered" value={counts.pushFailed + counts.pushUnreachable} icon={AlertTriangle} tone={counts.pushFailed > 0 ? "critical" : "default"} />}
      </div>

      <AnnouncementRecipientsTable rows={detail.recipients} showPush={detail.sendPush} showAck={detail.requiresAck} />
    </div>
  );
}
