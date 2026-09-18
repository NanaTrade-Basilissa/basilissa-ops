import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Layers,
  Loader2,
  Mail,
} from "lucide-react";
import { JobStatus } from "@prisma/client";
import { can, requirePermission } from "@/lib/modules/identity/server";
import {
  getJobQueueStats,
  listAllJobs,
} from "@/lib/modules/identity/server";
import { StatCard } from "@/components/admin/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { JobsTable } from "@/components/admin/jobs-table";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Background Jobs" };
export const dynamic = "force-dynamic";

const STATUS_FILTERS = [
  { id: "ALL", label: "All statuses" },
  { id: JobStatus.PENDING, label: "Queued" },
  { id: JobStatus.RUNNING, label: "Running" },
  { id: JobStatus.SUCCEEDED, label: "Succeeded" },
  { id: JobStatus.DEAD, label: "Dead / Failed" },
] as const;

export default async function BackgroundJobsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    type?: string;
    search?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const actor = await requirePermission("jobs:read");
  const canManage = can(actor, "jobs:manage");

  const params = await searchParams;
  const rawStatus = params.status?.toUpperCase();
  const activeStatus =
    rawStatus === "PENDING" ||
    rawStatus === "RUNNING" ||
    rawStatus === "SUCCEEDED" ||
    rawStatus === "DEAD"
      ? (rawStatus as JobStatus)
      : "ALL";

  const activeType = params.type || "ALL";
  const activeSearch = params.search || "";

  const rawPageSize = parseInt(params.pageSize ?? "20", 10);
  const pageSize = [10, 20, 50, 100].includes(rawPageSize) ? rawPageSize : 20;
  const currentPage = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const [stats, result] = await Promise.all([
    getJobQueueStats(),
    listAllJobs({
      status: activeStatus,
      type: activeType,
      search: activeSearch,
      page: currentPage,
      pageSize,
    }),
  ]);

  const makeFilterUrl = (newParams: {
    status?: string;
    type?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const sp = new URLSearchParams();
    const s = newParams.status !== undefined ? newParams.status : activeStatus;
    const t = newParams.type !== undefined ? newParams.type : activeType;
    const q = newParams.search !== undefined ? newParams.search : activeSearch;
    const p = newParams.page !== undefined ? newParams.page : currentPage;
    const ps = newParams.pageSize !== undefined ? newParams.pageSize : pageSize;

    if (s && s !== "ALL") sp.set("status", s);
    if (t && t !== "ALL") sp.set("type", t);
    if (q) sp.set("search", q);
    if (ps && ps !== 20) sp.set("pageSize", String(ps));
    if (p > 1) sp.set("page", String(p));

    const qs = sp.toString();
    return qs ? `/admin/jobs?${qs}` : "/admin/jobs";
  };

  return (
    <div className="space-y-6">
      {/* Header & Quick Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-bold text-foreground">Background Jobs</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              <Layers className="size-3.5 text-primary" />
              Physical Queue
            </span>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground mt-1">
            Physical Postgres background job queue and worker executions across all domain tasks.
            Inspect execution payloads, observe error traces, and retry failed operations.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/admin/email-queue"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-8 text-xs gap-1.5",
            )}
          >
            <Mail className="size-3.5 text-muted-foreground" />
            Email Queue <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>

      {/* Metrics Pods */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Queued / Scheduled"
          value={stats.pending}
          subtext="Waiting for worker pickup"
          icon={Clock}
        />
        <StatCard
          label="Currently Running"
          value={stats.running}
          subtext="Under active lock"
          icon={Loader2}
        />
        <StatCard
          label="Succeeded"
          value={stats.succeeded}
          subtext="Successfully executed"
          icon={CheckCircle2}
          tone="good"
        />
        <StatCard
          label="Dead / Failed"
          value={stats.dead}
          subtext={stats.dead > 0 ? "Requires review or retry" : "No failed jobs"}
          icon={AlertCircle}
          tone={stats.dead > 0 ? "critical" : "default"}
        />
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-4 border-b border-border pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
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

          {/* Search Input */}
          <form
            action="/admin/jobs"
            method="GET"
            className="flex items-center gap-2 max-w-sm w-full sm:w-auto"
          >
            {activeStatus !== "ALL" && (
              <input type="hidden" name="status" value={activeStatus} />
            )}
            {activeType !== "ALL" && (
              <input type="hidden" name="type" value={activeType} />
            )}
            <Input
              name="search"
              placeholder="Search by ID, type, or error..."
              defaultValue={activeSearch}
              className="h-8 text-xs w-full sm:w-64"
            />
            {activeSearch && (
              <Link
                href={makeFilterUrl({ search: "", page: 1 })}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Clear
              </Link>
            )}
          </form>
        </div>

        {/* Distinct Type Filters */}
        {result.availableTypes.length > 0 && (
          <div className="flex items-center gap-2 pt-1 overflow-x-auto pb-1 text-xs">
            <span className="font-medium text-muted-foreground shrink-0">Job Type:</span>
            <div className="flex flex-wrap gap-1">
              <Link
                href={makeFilterUrl({ type: "ALL", page: 1 })}
                className={cn(
                  buttonVariants({
                    variant: activeType === "ALL" ? "secondary" : "outline",
                    size: "sm",
                  }),
                  "h-7 px-2.5 text-xs",
                )}
              >
                All ({result.total})
              </Link>
              {result.availableTypes.map((t) => {
                const isActive = activeType === t;
                return (
                  <Link
                    key={t}
                    href={makeFilterUrl({ type: t, page: 1 })}
                    className={cn(
                      buttonVariants({
                        variant: isActive ? "secondary" : "outline",
                        size: "sm",
                      }),
                      "h-7 px-2.5 text-xs font-mono",
                    )}
                  >
                    {t}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Physical Jobs Table */}
      <JobsTable jobs={result.jobs} canManage={canManage} />

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
