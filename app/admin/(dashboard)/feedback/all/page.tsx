import type { Metadata } from "next";
import { Suspense } from "react";
import { prisma } from "@/lib/platform/prisma";
import { feedbackListFilterSchema } from "@/lib/modules/feedback/validation";
import { feedbackListWhere } from "@/lib/modules/feedback/server";
import { getAccraDayEnd } from "@/lib/platform/date";
import { FeedbackFilters } from "@/components/admin/feedback-filters";
import { FeedbackTable } from "@/components/admin/feedback-table";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { requireAnyBranchPermission } from "@/lib/modules/identity/server";

export const metadata: Metadata = { title: "All Submissions" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AllFeedbackSubmissionsPage({ searchParams }: { searchParams: SearchParams }) {
  const { scope } = await requireAnyBranchPermission("feedback:read");

  const raw = await searchParams;
  const parsed = feedbackListFilterSchema.safeParse({
    branchId: first(raw.branchId),
    from: first(raw.from),
    to: first(raw.to),
    rating: first(raw.rating),
    page: first(raw.page),
  });
  const filters = parsed.success ? parsed.data : {};
  const page = filters.page ?? 1;

  const fromDate = filters.from ? new Date(`${filters.from}T00:00:00Z`) : undefined;
  const toDate = filters.to ? getAccraDayEnd(new Date(`${filters.to}T00:00:00Z`)) : undefined;

  // Intersects the reader's scope with their filters. See feedbackListWhere:
  // merging the two lets `?branchId=` widen the query instead of narrowing it.
  const where = feedbackListWhere(scope, {
    branchId: filters.branchId,
    rating: filters.rating,
    from: fromDate,
    to: toDate,
  });

  const [submissions, total, branches] = await Promise.all([
    prisma.feedbackSubmission.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        submittedAt: true,
        overallScore: true,
        branch: { select: { id: true, name: true } },
      },
    }),
    prisma.feedbackSubmission.count({ where }),
    prisma.branch.findMany({
      where: scope.kind === "branches" ? { id: { in: scope.branchIds } } : undefined,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(targetPage: number) {
    const search = new URLSearchParams();
    if (filters.branchId) search.set("branchId", filters.branchId);
    if (filters.rating) search.set("rating", String(filters.rating));
    if (filters.from) search.set("from", filters.from);
    if (filters.to) search.set("to", filters.to);
    if (targetPage !== 1) search.set("page", String(targetPage));
    const qs = search.toString();
    return qs ? `/admin/feedback/all?${qs}` : "/admin/feedback/all";
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">All Submissions</h1>
        <p className="text-sm text-muted-foreground">Every customer submission across all branches.</p>
      </div>

      <Suspense fallback={<div className="h-[74px]" />}>
        <FeedbackFilters branches={branches.map((b) => ({ id: b.id, label: b.name }))} />
      </Suspense>

      <FeedbackTable submissions={submissions} />

      <DataTablePagination page={page} totalPages={totalPages} total={total} buildHref={pageHref} />
    </div>
  );
}
