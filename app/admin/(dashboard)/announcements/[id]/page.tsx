import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCheck, Mail, MessageSquare, RotateCw, Smartphone, Users } from "lucide-react";
import { can, requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { clearUrgentBannerAction, retryFailedDeliveriesAction } from "@/lib/modules/announcements/actions";
import { Button } from "@/components/ui/button";
import { getAnnouncementDetail } from "@/lib/modules/announcements/server";
import { AUDIENCE_LABELS } from "@/lib/modules/announcements/constants";
import { AnnouncementRecipientsTable } from "@/components/admin/announcement-recipients-table";
import { formatSent } from "@/components/admin/announcement-format";
import { PageHeader, PageShell } from "@/components/admin/page-shell";
import { StatCard } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/admin/status-badge";

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
    <PageShell>
      <PageHeader
        backHref="/admin/announcements"
        backLabel="Announcements"
        title={detail.title}
        badge={
          detail.isUrgent ? (
            <StatusBadge tone={detail.bannerActive ? "critical" : "warning"} dot>
              {detail.bannerActive ? "Urgent · Banner live" : "Urgent"}
            </StatusBadge>
          ) : undefined
        }
        description={`Sent ${formatSent(detail.createdAt)} by ${detail.createdByName} · ${AUDIENCE_LABELS[detail.audienceKind].label}`}
      />

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

      {counts.failedDeliveries > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <span>
            {counts.failedDeliveries} {counts.failedDeliveries === 1 ? "delivery" : "deliveries"} failed. Nobody who was
            already reached gets a second copy.
          </span>
          <form action={retryFailedDeliveriesAction}>
            <input type="hidden" name="announcementId" value={detail.id} />
            <Button type="submit" variant="outline" size="sm">
              <RotateCw className="size-4" />
              Retry failed
            </Button>
          </form>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sent to" value={counts.recipients} icon={Users} />
        <StatCard label="Read" value={`${counts.read} (${readPercent}%)`} icon={CheckCheck} />
        {detail.requiresAck && (
          <StatCard label="Confirmed" value={`${counts.acknowledged} of ${counts.recipients}`} icon={CheckCheck} tone={counts.acknowledged === counts.recipients ? "good" : "default"} />
        )}
        {detail.sendPush && <StatCard label="Push delivered" value={counts.pushSent} icon={Smartphone} tone="good" />}
        {detail.sendSms && <StatCard label="SMS sent" value={`${counts.smsSent} of ${counts.recipients}`} icon={MessageSquare} tone={counts.smsFailed > 0 ? "critical" : "default"} />}
        {detail.sendEmail && <StatCard label="Emails sent" value={`${counts.emailSent} of ${counts.recipients}`} icon={Mail} tone={counts.emailFailed > 0 ? "critical" : "default"} />}
        {detail.sendPush && <StatCard label="Push not delivered" value={counts.pushFailed + counts.pushUnreachable} icon={AlertTriangle} tone={counts.pushFailed > 0 ? "critical" : "default"} />}
      </div>

      <AnnouncementRecipientsTable rows={detail.recipients} showPush={detail.sendPush} showSms={detail.sendSms} showEmail={detail.sendEmail} showAck={detail.requiresAck} />
    </PageShell>
  );
}
