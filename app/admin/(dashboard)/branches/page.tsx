import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { toggleBranchActive } from "@/lib/modules/branches/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
          include: { _count: { select: { submissions: true } } },
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

      <Card>
        <CardContent className="px-0 sm:px-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Submissions</TableHead>
                <TableHead className="text-right">Avg score</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((branch) => {
                const avg = avgByBranch.get(branch.id);
                return (
                  <TableRow key={branch.id}>
                    <TableCell>
                      <Link href={`/admin/branches/${branch.id}`} className="font-medium text-foreground hover:underline">
                        {branch.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{branch.location}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={branch.isActive ? "default" : "outline"}>
                        {branch.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{branch._count.submissions}</TableCell>
                    <TableCell className="text-right">{avg != null ? avg.toFixed(1) : "-"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1.5">
                        <Link
                          href={`/admin/branches/${branch.id}`}
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          View
                        </Link>
                        <Link
                          href={`/admin/branches/${branch.id}/edit`}
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          Edit
                        </Link>
                        <form action={toggleBranchActive}>
                          <input type="hidden" name="id" value={branch.id} />
                          <input type="hidden" name="nextIsActive" value={(!branch.isActive).toString()} />
                          <Button size="sm" variant={branch.isActive ? "destructive" : "secondary"} type="submit">
                            {branch.isActive ? "Deactivate" : "Activate"}
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
