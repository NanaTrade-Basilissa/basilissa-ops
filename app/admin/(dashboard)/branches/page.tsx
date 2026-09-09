import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { buttonVariants } from "@/components/ui/button";
import { BranchesTable } from "@/components/admin/branches-table";
import { requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { branchWhere } from "@/lib/modules/identity/authorization";

export const metadata: Metadata = { title: "Branches" };
export const dynamic = "force-dynamic";

export default async function BranchesPage() {
  // `branchWhere` keys on `branchId`, which is right for rows that belong to a
  // branch. Branch rows ARE the branch, so the same scope has to be applied to
  // `id` instead.
  const { scope } = await requireAnyBranchPermission("branch:read");
  const scoped = branchWhere(scope);
  const branchFilter =
    scope.kind === "branches" ? { id: { in: scope.branchIds } } : undefined;

  const [branches, avgGroups] = scoped === null
    ? [[], []]
    : await Promise.all([
        prisma.branch.findMany({
          where: branchFilter,
          orderBy: { name: "asc" },
          include: { _count: { select: { employees: { where: { validTo: null } } } } },
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
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Branches</h1>
          <p className="text-sm text-muted-foreground">Manage locations and their feedback QR codes.</p>
        </div>
        <Link href="/admin/branches/new" className={buttonVariants({ variant: "default" })}>
          <Plus className="size-4" /> New branch
        </Link>
      </div>

      <BranchesTable
        branches={branches.map((branch) => ({
          id: branch.id,
          name: branch.name,
          location: branch.location,
          isActive: branch.isActive,
          _count: branch._count,
          avgScore: avgByBranch.get(branch.id) ?? null,
        }))}
      />
    </div>
  );
}
