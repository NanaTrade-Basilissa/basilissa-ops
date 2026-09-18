import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Plus, Timer } from "lucide-react";
import { can, requirePermission } from "@/lib/modules/identity/server";
import { listAptitudeTests } from "@/lib/modules/aptitude/server";
import { createAptitudeTestAction } from "@/lib/modules/aptitude/actions";
import { Button } from "@/components/ui/button";
import { AptitudeTestCreateDialog } from "@/components/admin/aptitude-test-create-dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { AptitudeTestsTable } from "@/components/admin/aptitude-tests-table";

export const metadata: Metadata = { title: "All aptitude tests" };
export const dynamic = "force-dynamic";

export default async function AllAptitudeTestsPage() {
  const actor = await requirePermission("aptitude:read");
  const canWrite = can(actor, "aptitude:write");
  const tests = await listAptitudeTests();

  return (
    <div className="space-y-6">
      <Link
        href="/admin/aptitude-tests"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to overview
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">All aptitude tests</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Full list of candidate screening tests.
          </p>
        </div>
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
        <AptitudeTestsTable tests={tests} />
      )}
    </div>
  );
}
