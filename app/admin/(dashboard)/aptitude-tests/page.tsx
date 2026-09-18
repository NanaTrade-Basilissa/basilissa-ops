import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { can, requirePermission } from "@/lib/modules/identity/server";
import { listAptitudeTestsPaginated } from "@/lib/modules/aptitude/server";
import { createAptitudeTestAction } from "@/lib/modules/aptitude/actions";
import { AptitudeTestCreateDialog } from "@/components/admin/aptitude-test-create-dialog";
import { AptitudeTestsTable } from "@/components/admin/aptitude-tests-table";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Timer } from "lucide-react";

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

  const { tests, total, totalPages, pageSize } = await listAptitudeTestsPaginated({ page, pageSize: 10 });

  function pageHref(targetPage: number) {
    return targetPage === 1
      ? "/admin/aptitude-tests"
      : `/admin/aptitude-tests?page=${targetPage}`;
  }

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
                  <Plus className="size-4" /> New test
                </Button>
              }
            />
          )}
        </div>
      </div>

      {tests.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Timer />
            </EmptyMedia>
            <EmptyTitle>Nothing here yet</EmptyTitle>
            <EmptyDescription className="text-xs">Create a test to get started.</EmptyDescription>
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
