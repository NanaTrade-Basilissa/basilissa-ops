import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createBranch } from "@/lib/modules/branches/actions";
import { BranchForm } from "@/components/admin/branch-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requirePermission } from "@/lib/modules/identity/server";

export const metadata: Metadata = { title: "New branch" };

export default async function NewBranchPage() {
  // Naming no branch means a GLOBAL grant is required, matching createBranch:
  // a branch-scoped grant runs branches, it does not create them. Offering a
  // form the action will refuse is worse than not offering it.
  await requirePermission("branch:write");

  return (
    <div className="space-y-4">
      <Link
        href="/admin/branches"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to branches
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Create a branch</CardTitle>
          <CardDescription>New branches start out active and accept feedback immediately.</CardDescription>
        </CardHeader>
        <CardContent>
          <BranchForm action={createBranch} submitLabel="Create branch" />
        </CardContent>
      </Card>
    </div>
  );
}
