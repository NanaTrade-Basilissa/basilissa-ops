import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus, Timer } from "lucide-react";
import type { AptitudeTestStatus } from "@prisma/client";
import { can, requirePermission } from "@/lib/modules/identity/server";
import { listAptitudeTestsPaginated } from "@/lib/modules/aptitude/server";
import { createAptitudeTestAction } from "@/lib/modules/aptitude/actions";
import { AptitudeTestCreateDialog } from "@/components/admin/aptitude-test-create-dialog";
import { AptitudeTestsTable } from "@/components/admin/aptitude-tests-table";
import { PageHeader, PageShell } from "@/components/admin/page-shell";
import { TestFilters } from "@/components/admin/test-filters";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export const metadata: Metadata = { title: "Aptitude Tests" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const ALLOWED_PAGE_SIZES = new Set([10, 20, 50]);

export default async function AptitudeTestsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePermission("aptitude:read");
  const canWrite = can(actor, "aptitude:write");

  const rawParams = await searchParams;
  const page = Number(first(rawParams.page)) || 1;
  const rawPageSize = Number(first(rawParams.pageSize)) || 20;
  const requestedPageSize = ALLOWED_PAGE_SIZES.has(rawPageSize) ? rawPageSize : 20;
  const search = first(rawParams.search) || undefined;
  const status = (first(rawParams.status) as AptitudeTestStatus) || undefined;

  const { tests, total, totalPages, pageSize } = await listAptitudeTestsPaginated({
    search,
    status,
    page,
    pageSize: requestedPageSize,
  });

  function buildUrl(targetPage: number, targetSize: number) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (targetSize !== 20) params.set("pageSize", String(targetSize));
    if (targetPage !== 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/admin/aptitude-tests?${qs}` : "/admin/aptitude-tests";
  }

  const hasFilters = Boolean(search || status);

  return (
    <PageShell>
      <PageHeader
        title="Aptitude Tests"
        description="Timed screening tests for job candidates."
        actions={
          canWrite ? (
            <AptitudeTestCreateDialog
              action={createAptitudeTestAction}
              trigger={
                <Button size="sm" className="h-9 gap-1.5 text-xs">
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">New test</span>
                </Button>
              }
            />
          ) : undefined
        }
      />

      <div className="space-y-3">
        <Suspense fallback={<div className="h-9" />}>
          <TestFilters searchPlaceholder="Search test title..." />
        </Suspense>

        {tests.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Timer />
              </EmptyMedia>
              <EmptyTitle>{hasFilters ? "No tests found" : "Nothing here yet"}</EmptyTitle>
              <EmptyDescription className="text-xs">
                {hasFilters
                  ? "Try adjusting your search or filter criteria."
                  : "Create a test to get started."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <AptitudeTestsTable tests={tests} />
            <DataTablePagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              buildHref={(p) => buildUrl(p, pageSize)}
              buildPageSizeHref={(size) => buildUrl(1, size)}
              alwaysShow
            />
          </>
        )}
      </div>
    </PageShell>
  );
}
