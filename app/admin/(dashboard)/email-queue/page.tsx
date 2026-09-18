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
import { JobsFilters } from "@/components/admin/jobs-filters";
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
  searchParams: Promise<{ status?: string; type?: string; search?: string; page?: string; pageSize?: string }>;
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

  const activeSearch = params.search || "";
  const rawPageSize = parseInt(params.pageSize ?? "10", 10);
  const pageSize = [10, 20, 50].includes(rawPageSize) ? rawPageSize : 10;
  const currentPage = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const [stats, result] = await Promise.all([
    getEmailQueueStats(),
    listEmailJobs({
      status: activeStatus,
      type: activeType,
      search: activeSearch,
      page: currentPage,
      pageSize,
    }),
  ]);

  const makeFilterUrl = (newParams: { status?: string; type?: string; search?: string; page?: number; pageSize?: number }) => {
    const sp = new URLSearchParams();
    const s = newParams.status !== undefined ? newParams.status : activeStatus;
    const t = newParams.type !== undefined ? newParams.type : activeType;
    const q = newParams.search !== undefined ? newParams.search : activeSearch;
    const p = newParams.page !== undefined ? newParams.page : currentPage;
    const ps = newParams.pageSize !== undefined ? newParams.pageSize : pageSize;

    if (s && s !== "ALL") sp.set("status", s);
    if (t && t !== "ALL") sp.set("type", t);
    if (q) sp.set("search", q);
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
          <p className="text-xs text-muted-foreground mt-0.5">
            Outgoing transactional emails and delivery states.
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
          label="Queued"
          value={stats.pending}
          subtext="Waiting for pickup"
          icon={Clock}
        />
        <StatCard
          label="Sending"
          value={stats.running}
          subtext="Under active lock"
          icon={Loader2}
        />
        <StatCard
          label="Delivered"
          value={stats.succeeded}
          subtext="Sent successfully"
          icon={CheckCircle2}
          tone="good"
        />
        <StatCard
          label="Failed"
          value={stats.dead}
          subtext={stats.dead > 0 ? "Requires review" : "No failed emails"}
          icon={AlertCircle}
          tone={stats.dead > 0 ? "critical" : "default"}
        />
      </div>

      {/* Filter Toolbar */}
      <JobsFilters
        basePath="/admin/email-queue"
        statusOptions={STATUS_FILTERS.map((f) => ({ value: f.id, label: f.label }))}
        typeOptions={TYPE_FILTERS.map((t) => ({ value: t.id, label: t.label }))}
      />

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
