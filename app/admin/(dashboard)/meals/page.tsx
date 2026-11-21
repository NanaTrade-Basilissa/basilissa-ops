import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, MonitorPlay } from "lucide-react";
import { requireAnyBranchPermission, can } from "@/lib/modules/identity/server";
import { prisma } from "@/lib/platform/prisma";
import { getWeeklyMealPlans } from "@/lib/modules/meals/service";
import { accraDateKey, getAccraWeekStart, shiftDateKey } from "@/lib/platform/date";
import { buttonVariants } from "@/components/ui/button";
import { MealPlannerForm } from "@/components/admin/meals/meal-planner-form";
import { MealsBranchSelect } from "@/components/admin/meals/meals-branch-select";
import { WallQrDialog } from "@/components/admin/meals/wall-qr-dialog";
import { PageHeader, PageShell } from "@/components/admin/page-shell";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Staff Meals Management" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ branchId?: string; week?: string }>;

export default async function MealsPage({ searchParams }: { searchParams: SearchParams }) {
  const { actor, scope } = await requireAnyBranchPermission("meals:read");

  const raw = await searchParams;

  const branchFilter =
    scope.kind === "branches"
      ? { id: { in: scope.branchIds } }
      : scope.kind === "none"
        ? { id: { in: [] } }
        : undefined;

  const branches = await prisma.branch.findMany({
    where: { ...branchFilter, isActive: true },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });

  if (branches.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No active branches available for your user account.
      </div>
    );
  }

  const selectedBranch =
    branches.find((b) => b.id === raw.branchId) ?? branches[0]!;

  const canWriteThisBranch = can(actor, "meals:write", { branchId: selectedBranch.id });

  // Week resolution: snap to Monday of Accra calendar week
  const currentWeekStart = accraDateKey(getAccraWeekStart(new Date()));
  const weekStartKey =
    raw.week && /^\d{4}-\d{2}-\d{2}$/.test(raw.week) ? raw.week : currentWeekStart;
  const prevWeekKey = shiftDateKey(weekStartKey, -7);
  const nextWeekKey = shiftDateKey(weekStartKey, 7);
  const weekEndKey = shiftDateKey(weekStartKey, 6);

  const startObj = new Date(`${weekStartKey}T12:00:00Z`);
  const endObj = new Date(`${weekEndKey}T12:00:00Z`);
  const weekLabel = `${startObj.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${endObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const weeklyData = await getWeeklyMealPlans(selectedBranch.id, weekStartKey);

  return (
    <PageShell>
      <PageHeader
        title="Staff Meals"
        description="Plan daily staff dishes, configure weekly cutoffs, and track kitchen portions."
        actions={
          <>
            <WallQrDialog
              branchId={selectedBranch.id}
              branchName={selectedBranch.name}
              branchSlug={selectedBranch.slug}
              triggerClassName="h-9 gap-1.5 text-xs sm:text-sm"
            />
            <Link
              href={`/admin/meals/station?branchId=${selectedBranch.id}`}
              className={cn(
                buttonVariants({ variant: "default", size: "sm" }),
                "h-9 gap-1.5",
              )}
            >
              <MonitorPlay className="size-4 shrink-0" />
              <span className="whitespace-nowrap">Live Kitchen</span>
            </Link>
          </>
        }
      />

      {/* Filter and Navigation Controls */}
      <div className="flex flex-col gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10 lg:flex-row lg:items-center lg:justify-between w-full min-w-0">
        <div className="flex items-center justify-between gap-3 w-full lg:w-auto min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
            Branch:
          </span>
          <div className="flex-1 lg:flex-initial min-w-0">
            <MealsBranchSelect
              branches={branches}
              selectedBranchId={selectedBranch.id}
              week={weekStartKey}
            />
          </div>
        </div>

        <div className="flex items-center justify-between lg:justify-end gap-1.5 sm:gap-2 w-full lg:w-auto pt-2 border-t lg:pt-0 lg:border-t-0 min-w-0">
          <Link
            href={`/admin/meals?branchId=${selectedBranch.id}&week=${prevWeekKey}`}
            className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }), "shrink-0")}
            title="Previous Week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>

          <span className="text-xs font-semibold px-2 py-1.5 bg-background rounded-md border flex-1 sm:flex-initial min-w-0 sm:min-w-44 text-center truncate">
            {weekLabel}
          </span>

          <Link
            href={`/admin/meals?branchId=${selectedBranch.id}&week=${nextWeekKey}`}
            className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }), "shrink-0")}
            title="Next Week"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>

          {weekStartKey !== currentWeekStart && (
            <Link
              href={`/admin/meals?branchId=${selectedBranch.id}&week=${currentWeekStart}`}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-xs shrink-0 px-2")}
            >
              This Week
            </Link>
          )}
        </div>
      </div>

      {/* Main Meal Planner Grid & Form */}
      <MealPlannerForm
        branchId={selectedBranch.id}
        branchName={selectedBranch.name}
        canWrite={canWriteThisBranch}
        weekMonday={weekStartKey}
        initialCutoffAt={weeklyData.weekCutoffAt}
        initialDays={weeklyData.days}
      />
    </PageShell>
  );
}
