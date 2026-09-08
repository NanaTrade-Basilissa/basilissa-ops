import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/modules/identity/server";
import { prisma } from "@/lib/platform/prisma";
import { getShift } from "@/lib/modules/employees/server";
import { minutesToTime } from "@/lib/modules/employees/validation";
import { updateShift } from "@/lib/modules/employees/actions";
import { ShiftForm } from "@/components/admin/shift-form";
import { requireFeature } from "@/lib/platform/features-guard";

export const metadata: Metadata = { title: "Edit shift" };
export const dynamic = "force-dynamic";

export default async function EditShiftPage({ params }: { params: Promise<{ id: string }> }) {
  requireFeature("attendance");

  await requirePermission("schedule:write");
  const { id } = await params;

  const [shift, branches] = await Promise.all([
    getShift(id),
    prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!shift) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Edit shift</h1>
        <p className="text-sm text-muted-foreground">
          Existing assignments keep pointing at this template, so changing the hours
          changes what future days are measured against. Attendance already settled keeps
          the schedule it was calculated with.
        </p>
      </div>
      <ShiftForm
        action={updateShift.bind(null, shift.id)}
        branches={branches}
        submitLabel="Save changes"
        defaultValues={{
          name: shift.name,
          branchId: shift.branchId ?? "",
          startTime: minutesToTime(shift.startMinute),
          endTime: minutesToTime(shift.endMinute),
          unpaidBreakMinutes: shift.unpaidBreakMinutes,
          isActive: shift.isActive,
        }}
      />
    </div>
  );
}
