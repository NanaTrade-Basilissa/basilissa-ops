import type { Metadata } from "next";
import { requirePermission } from "@/lib/modules/identity/server";
import { prisma } from "@/lib/platform/prisma";
import { createShift } from "@/lib/modules/employees/actions";
import { ShiftForm } from "@/components/admin/shift-form";
import { requireFeature } from "@/lib/platform/features-guard";

export const metadata: Metadata = { title: "New shift" };
export const dynamic = "force-dynamic";

export default async function NewShiftPage() {
  requireFeature("attendance");

  await requirePermission("schedule:write");
  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold text-foreground">New shift</h1>
      <ShiftForm action={createShift} branches={branches} submitLabel="Create shift" />
    </div>
  );
}
