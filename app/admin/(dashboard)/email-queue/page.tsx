import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, Clock, Layers, Loader2 } from "lucide-react";
import { JobStatus } from "@prisma/client";
import { can, requirePermission } from "@/lib/modules/identity/server";
import {
  EMAIL_JOB_TYPES,
  getEmailQueueStats,
  listEmailJobs,
} from "@/lib/modules/identity/server";
import { StatCard } from "@/components/admin/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { EmailQueueTable } from "@/components/admin/email-queue-table";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Email Queue" };
export const dynamic = "force-dynamic";

const STATUS_FILTERS = [
  { id: "ALL", label: "All statuses" },
  { id: JobStatus.PENDING, label: "Queued" },
  { id: JobStatus.RUNNING, label: "Sending" },
  { id: JobStatus.SUCCEEDED, label: "Sent" },
  { id: JobStatus.DEAD, label: "Failed" },
] as const;

const TYPE_FILTERS = [
  { id: "ALL", label: "All email types" },
  { id: "feedback.notify", label: "Feedback Alerts" },
  { id: "identity.password_reset_send", label: "Password Resets & Invites" },
  { id: "assessments.invitation_send", label: "Assessment Invites" },
  { id: "aptitude.invitation_send", label: "Aptitude Invites" },
] as const;

export default async function EmailQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; page?: string; pageSize?: string }>;
}) {
  // Super Admin only: non-super-admins redirect to /admin?denied=1
  const actor = await requirePermission("email_queue:read");
  const canManage = can(actor, "email_queue:manage");

  const params = await searchParams;
  const rawStatus = params.status?.toUpperCase();
  const activeStatus =
    rawStatus === "PENDING" ||
    rawStatus === "RUNNING" ||
    rawStatus === "SUCCEEDED" ||
    rawStatus === "DEAD"
      ? (rawStatus as JobStatus)
      : "ALL";

  const activeType = params.type && EMAIL_JOB_TYPES.includes(params.type as (typeof EMAIL_JOB_TYPES)[number])
    ? params.type
    : "ALL";

  const rawPageSize = parseInt(params.pageSize ?? "10", 10);
  const pageSize = [10, 20, 50].includes(rawPageSize) ? rawPageSize : 10;
  const currentPage = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const [stats, result] = await Promise.all([
    getEmailQueueStats(),
    listEmailJobs({
      status: activeStatus,
      type: activeType,
      page: currentPage,
      pageSize,
    }),
  ]);

  const makeFilterUrl = (newParams: { status?: string; type?: string; page?: number; pageSize?: number }) => {
    const sp = new URLSearchParams();
    const s = newParams.status !== undefined ? newParams.status : activeStatus;
    const t = newParams.type !== undefined ? newParams.type : activeType;
    const p = newParams.page !== undefined ? newParams.page : currentPage;
    const ps = newParams.pageSize !== undefined ? newParams.pageSize : pageSize;

    if (s && s !== "ALL") sp.set("status", s);
    if (t && t !== "ALL") sp.set("type", t);
    if (ps && ps !== 10) sp.set("pageSize", String(ps));
    if (p > 1) sp.set("page", String(p));

    const qs = sp.toString();
    return qs ? `/admin/email-queue?${qs}` : "/admin/email-queue";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Email Queue</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Monitor outgoing transactional emails dispatched by background workers. Inspect delivery
            states, view failure causes, or trigger resends and retries.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/admin/jobs"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-8 text-xs gap-1.5",
            )}
          >
            <Layers className="size-3.5 text-muted-foreground" />
            All Background Jobs <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Queued / Scheduled"
          value={stats.pending}
          subtext="Waiting for worker pickup"
          icon={Clock}
        />
        <StatCard
          label="Currently Sending"
          value={stats.running}
          subtext="Under active lock"
          icon={Loader2}
        />
        <StatCard
          label="Delivered / Sent"
          value={stats.succeeded}
          subtext="Successfully completed"
          icon={CheckCircle2}
          tone="good"
        />
        <StatCard
          label="Failed / Dead"
          value={stats.dead}
          subtext={stats.dead > 0 ? "Requires administrative review" : "No dead jobs"}
          icon={AlertCircle}
          tone={stats.dead > 0 ? "critical" : "default"}
        />
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((f) => {
            const isActive = activeStatus === f.id;
            return (
              <Link
                key={f.id}
                href={makeFilterUrl({ status: f.id, page: 1 })}
                className={cn(
                  buttonVariants({
                    variant: isActive ? "default" : "ghost",
                    size: "sm",
                  }),
                  "h-8 text-xs font-medium",
                )}
              >
                {f.label}
              </Link>
            );
          })}
        </div>

        {/* Type Filter Select */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Type:</span>
          <div className="flex flex-wrap gap-1">
            {TYPE_FILTERS.map((t) => {
              const isActive = activeType === t.id;
              return (
                <Link
                  key={t.id}
                  href={makeFilterUrl({ type: t.id, page: 1 })}
                  className={cn(
                    buttonVariants({
                      variant: isActive ? "secondary" : "outline",
                      size: "sm",
                    }),
                    "h-7 px-2.5 text-xs",
                  )}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Table */}
      <EmailQueueTable jobs={result.jobs} canManage={canManage} />

      {/* Pagination */}
      <DataTablePagination
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        pageSize={pageSize}
        buildHref={(p) => makeFilterUrl({ page: p })}
        buildPageSizeHref={(ps) => makeFilterUrl({ pageSize: ps, page: 1 })}
        alwaysShow={true}
      />
    </div>
  );
}
