import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/platform/prisma";
import { feedbackListFilterSchema } from "@/lib/modules/feedback/validation";
import { feedbackListWhere } from "@/lib/modules/feedback/server";
import { getAccraDayEnd, formatAccraDateTime } from "@/lib/platform/date";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, ratingBadgeVariant } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { FeedbackFilters } from "@/components/admin/feedback-filters";
import { requireAnyBranchPermission } from "@/lib/modules/identity/server";

export const metadata: Metadata = { title: "Feedback" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function FeedbackListPage({ searchParams }: { searchParams: SearchParams }) {
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
      // Offering a branch in the filter that the results can never contain
      // reads as missing data rather than as a boundary.
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
    return qs ? `/admin/feedbacks?${qs}` : "/admin/feedbacks";
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Feedback</h1>
        <p className="text-sm text-muted-foreground">Every customer submission across all branches.</p>
      </div>

      <Suspense fallback={<div className="h-[74px]" />}>
        <FeedbackFilters branches={branches.map((b) => ({ id: b.id, label: b.name }))} />
      </Suspense>

      <Card>
        <CardContent className="px-0 sm:px-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Submission ID</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="text-right">Overall</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{s.id}</TableCell>
                  <TableCell className="text-muted-foreground">{formatAccraDateTime(s.submittedAt)}</TableCell>
                  <TableCell>
                    <Link href={`/admin/branches/${s.branch.id}`} className="font-medium text-foreground hover:underline">
                      {s.branch.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={ratingBadgeVariant(Math.round(s.overallScore))}>
                      {s.overallScore.toFixed(1)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {submissions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center text-sm text-muted-foreground">
                    No submissions match the selected filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total} total)
          </p>
          <div className="flex gap-1.5">
            <Link
              href={pageHref(page - 1)}
              aria-disabled={page <= 1}
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: page <= 1 ? "pointer-events-none opacity-50" : undefined,
              })}
            >
              Previous
            </Link>
            <Link
              href={pageHref(page + 1)}
              aria-disabled={page >= totalPages}
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: page >= totalPages ? "pointer-events-none opacity-50" : undefined,
              })}
            >
              Next
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
