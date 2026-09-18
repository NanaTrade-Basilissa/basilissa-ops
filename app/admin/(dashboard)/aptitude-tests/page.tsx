import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus, Timer } from "lucide-react";
import type { AptitudeTestStatus } from "@prisma/client";
import { can, requirePermission } from "@/lib/modules/identity/server";
import { listAptitudeTestsPaginated } from "@/lib/modules/aptitude/server";
import { createAptitudeTestAction } from "@/lib/modules/aptitude/actions";
import { AptitudeTestCreateDialog } from "@/components/admin/aptitude-test-create-dialog";
import { AptitudeTestsTable } from "@/components/admin/aptitude-tests-table";
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

export default async function AptitudeTestsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePermission("aptitude:read");
  const canWrite = can(actor, "aptitude:write");

  const rawParams = await searchParams;
  const page = Number(first(rawParams.page)) || 1;
  const search = first(rawParams.search) || undefined;
  const status = (first(rawParams.status) as AptitudeTestStatus) || undefined;

  const { tests, total, totalPages, pageSize } = await listAptitudeTestsPaginated({
    search,
    status,
    page,
    pageSize: 10,
  });

  function pageHref(targetPage: number) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (targetPage !== 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/admin/aptitude-tests?${qs}` : "/admin/aptitude-tests";
  }

  const hasFilters = Boolean(search || status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Aptitude Tests</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Timed screening tests for job candidates.
          </p>
        </div>
        <div>
          {canWrite && (
            <AptitudeTestCreateDialog
              action={createAptitudeTestAction}
              trigger={
                <Button size="sm">
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">New test</span>
                </Button>
              }
            />
          )}
        </div>
      </div>

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
        <div className="space-y-4">
          <AptitudeTestsTable tests={tests} />
          <DataTablePagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            buildHref={pageHref}
          />
        </div>
      )}
    </div>
  );
}
