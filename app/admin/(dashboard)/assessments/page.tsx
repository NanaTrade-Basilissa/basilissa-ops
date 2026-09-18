import type { Metadata } from "next";
import { ClipboardCheck, Plus } from "lucide-react";
import { can, requirePermission } from "@/lib/modules/identity/server";
import { listAssessmentsPaginated } from "@/lib/modules/assessments/server";
import { createAssessmentAction } from "@/lib/modules/assessments/actions";
import { AssessmentCreateDialog } from "@/components/admin/assessment-create-dialog";
import { AssessmentsTable } from "@/components/admin/assessments-table";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export const metadata: Metadata = { title: "Assessments" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AssessmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePermission("assessment:read");
  const canWrite = can(actor, "assessment:write");

  const rawParams = await searchParams;
  const page = Number(first(rawParams.page)) || 1;

  const { assessments, total, totalPages, pageSize } = await listAssessmentsPaginated({ page, pageSize: 10 });

  function pageHref(targetPage: number) {
    return targetPage === 1
      ? "/admin/assessments"
      : `/admin/assessments?page=${targetPage}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Assessments</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Staff tests and evaluation results.
          </p>
        </div>
        <div>
          {canWrite && (
            <AssessmentCreateDialog
              action={createAssessmentAction}
              trigger={
                <Button size="sm">
                  <Plus className="size-4" /> New assessment
                </Button>
              }
            />
          )}
        </div>
      </div>

      {assessments.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardCheck />
            </EmptyMedia>
            <EmptyTitle>Nothing here yet</EmptyTitle>
            <EmptyDescription className="text-xs">Create an assessment to get started.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-4">
          <AssessmentsTable assessments={assessments} />
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
