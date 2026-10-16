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
    <div className="space-y-6">
      {/* Top Header / Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <UtensilsCrossed className="h-6 w-6 text-primary" />
            Staff Meals & Kitchen Station
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Plan daily staff dishes, publish menus for employee selection, and track portion counts.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <WallQrDialog
            branchId={selectedBranch.id}
            branchName={selectedBranch.name}
            branchSlug={selectedBranch.slug}
          />

          <Link
            href={`/admin/meals/station?branchId=${selectedBranch.id}`}
            className={cn(
              buttonVariants({ variant: "default", size: "sm" }),
              "gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium",
            )}
          >
            <MonitorPlay className="h-4 w-4" />
            Live Kitchen Screen
          </Link>
        </div>
      </div>

      {/* Filter and Navigation Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20 p-3 rounded-xl border">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Branch:
          </span>
          <MealsBranchSelect
            branches={branches}
            selectedBranchId={selectedBranch.id}
            week={weekStartKey}
          />
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Link
            href={`/admin/meals?branchId=${selectedBranch.id}&week=${prevWeekKey}`}
            className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))}
            title="Previous Week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>

          <span className="text-xs font-semibold px-2 py-1 bg-background rounded-md border min-w-44 text-center">
            {weekLabel}
          </span>

          <Link
            href={`/admin/meals?branchId=${selectedBranch.id}&week=${nextWeekKey}`}
            className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))}
            title="Next Week"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>

          {weekStartKey !== currentWeekStart && (
            <Link
              href={`/admin/meals?branchId=${selectedBranch.id}&week=${currentWeekStart}`}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-xs")}
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
