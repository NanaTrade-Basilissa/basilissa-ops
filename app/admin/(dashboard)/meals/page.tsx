import type { Metadata } from "next";
import Link from "next/link";
import { UtensilsCrossed, ChevronLeft, ChevronRight, MonitorPlay } from "lucide-react";
import { requireAnyBranchPermission, can, hasAnyPermission } from "@/lib/modules/identity/server";
import { prisma } from "@/lib/platform/prisma";
import { getWeeklyMealPlans } from "@/lib/modules/meals/service";
import { accraDateKey, getAccraWeekStart, shiftDateKey } from "@/lib/platform/date";
import { Button, buttonVariants } from "@/components/ui/button";
import { MealPlannerForm } from "@/components/admin/meals/meal-planner-form";
import { MealsBranchSelect } from "@/components/admin/meals/meals-branch-select";
import { WallQrDialog } from "@/components/admin/meals/wall-qr-dialog";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Staff Meals Management" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ branchId?: string; week?: string }>;

export default async function MealsPage({ searchParams }: { searchParams: SearchParams }) {
  const { actor, scope } = await requireAnyBranchPermission("meals:read");
  const canWriteAny = hasAnyPermission(actor, "meals:write");

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
    <div className="space-y-6 w-full max-w-full min-w-0 overflow-x-hidden">
      {/* Top Header / Actions Bar */}
      <div className="flex flex-col gap-3 pb-3 border-b sm:flex-row sm:items-center sm:justify-between w-full min-w-0">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
            <span className="truncate">Staff Meals</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Plan daily staff dishes, set weekly cutoff, and track portions.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center min-w-0">
          <WallQrDialog
            branchId={selectedBranch.id}
            branchName={selectedBranch.name}
            branchSlug={selectedBranch.slug}
            triggerClassName="w-full min-w-0 justify-center text-xs sm:text-sm px-2.5 sm:px-3"
          />

          <Link
            href={`/admin/meals/station?branchId=${selectedBranch.id}`}
            className={cn(
              buttonVariants({ variant: "default", size: "sm" }),
              "gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-medium justify-center text-xs sm:text-sm w-full min-w-0 px-2.5 sm:px-3",
            )}
          >
            <MonitorPlay className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="truncate">Live Kitchen</span>
          </Link>
        </div>
      </div>

      {/* Filter and Navigation Controls */}
      <div className="flex flex-col gap-3 bg-muted/20 p-3 rounded-xl border sm:flex-row sm:items-center sm:justify-between w-full min-w-0">
        <div className="flex items-center justify-between gap-3 w-full sm:w-auto min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
            Branch:
          </span>
          <div className="flex-1 sm:flex-initial min-w-0">
            <MealsBranchSelect
              branches={branches}
              selectedBranchId={selectedBranch.id}
              week={weekStartKey}
            />
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2 w-full sm:w-auto pt-2 border-t sm:pt-0 sm:border-t-0 min-w-0">
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
    </div>
  );
}
