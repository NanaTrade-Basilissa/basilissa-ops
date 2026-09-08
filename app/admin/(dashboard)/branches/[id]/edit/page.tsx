import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { updateBranch } from "@/lib/modules/branches/actions";
import { BranchForm } from "@/components/admin/branch-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requireBranchPermission } from "@/lib/modules/identity/server";

export const metadata: Metadata = { title: "Edit branch" };

type Params = Promise<{ id: string }>;

export default async function EditBranchPage({ params }: { params: Params }) {
  const { id } = await params;
  await requireBranchPermission("branch:write", id);

  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch) notFound();

  const boundUpdateBranch = updateBranch.bind(null, branch.id);

  return (
    <div className="space-y-4">
      <Link
        href={`/admin/branches/${branch.id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to {branch.name}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Edit branch</CardTitle>
          <CardDescription>Changing the slug also changes this branch&apos;s QR code link.</CardDescription>
        </CardHeader>
        <CardContent>
          <BranchForm
            action={boundUpdateBranch}
            submitLabel="Save changes"
            defaultValues={{
              name: branch.name,
              slug: branch.slug,
              location: branch.location,
              isActive: branch.isActive,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
