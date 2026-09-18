import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { createBranch } from "@/lib/modules/branches/actions";
import { Button } from "@/components/ui/button";
import { BranchDialog } from "@/components/admin/branch-dialog";
import { BranchesTable } from "@/components/admin/branches-table";
import { requireAnyBranchPermission, can } from "@/lib/modules/identity/server";
import { branchWhere } from "@/lib/modules/identity/authorization";

export const metadata: Metadata = { title: "Branches" };
export const dynamic = "force-dynamic";

export default async function BranchesPage() {
  // `branchWhere` keys on `branchId`, which is right for rows that belong to a
  // branch. Branch rows ARE the branch, so the same scope has to be applied to
  // `id` instead.
  const { actor, scope } = await requireAnyBranchPermission("branch:read");
  const scoped = branchWhere(scope);
  const branchFilter =
    scope.kind === "branches" ? { id: { in: scope.branchIds } } : undefined;
  const canCreate = can(actor, "branch:write");

  const [branches, avgGroups] = scoped === null
    ? [[], []]
    : await Promise.all([
        prisma.branch.findMany({
          where: branchFilter,
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            slug: true,
            location: true,
            isActive: true,
            latitude: true,
            longitude: true,
            geofenceRadiusMeters: true,
            geofenceEnabled: true,
            _count: { select: { employees: { where: { validTo: null } } } },
          },
        }),
        prisma.feedbackSubmission.groupBy({
          by: ["branchId"],
          where: scoped,
          _avg: { overallScore: true },
        }),
      ]);

  const avgByBranch = new Map(avgGroups.map((g) => [g.branchId, g._avg.overallScore]));

  return (
    <div className="space-y-4">
      <BranchesTable
        branches={branches.map((branch) => ({
          id: branch.id,
          name: branch.name,
          slug: branch.slug,
          location: branch.location,
          isActive: branch.isActive,
          latitude: branch.latitude,
          longitude: branch.longitude,
          geofenceRadiusMeters: branch.geofenceRadiusMeters,
          geofenceEnabled: branch.geofenceEnabled,
          canWrite: can(actor, "branch:write", { branchId: branch.id }),
          _count: branch._count,
          avgScore: avgByBranch.get(branch.id) ?? null,
        }))}
        actionSlot={
          canCreate ? (
            <BranchDialog
              action={createBranch}
              submitLabel="Create branch"
              title="Create a branch"
              description="New branches start out active and accept feedback immediately."
              trigger={
                <Button size="sm" className="h-9 gap-1.5 text-xs">
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">New branch</span>
                </Button>
              }
            />
          ) : undefined
        }
      />
    </div>
  );
}
