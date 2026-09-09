import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { can, requirePermission } from "@/lib/modules/identity/server";
import { listShifts } from "@/lib/modules/employees/server";
import { minutesToTime } from "@/lib/modules/employees/validation";
import { prisma } from "@/lib/platform/prisma";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { ShiftsTable } from "@/components/admin/shifts-table";
import { requireFeature } from "@/lib/platform/features-guard";

export const metadata: Metadata = { title: "Shifts" };
export const dynamic = "force-dynamic";

export default async function ShiftsPage() {
  requireFeature("attendance");

  const actor = await requirePermission("schedule:read");
  const canWrite = can(actor, "schedule:write");
  const [shifts, branches] = await Promise.all([
    listShifts(),
    prisma.branch.findMany({ select: { id: true, name: true } }),
  ]);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Shifts</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Reusable templates. Times have no date attached: they resolve against the
            branch&rsquo;s timezone on whichever day they apply.
          </p>
        </div>
        {canWrite && (
          <Link href="/admin/shifts/new" className={buttonVariants()}>
            <Plus className="size-4" />
            New shift
          </Link>
        )}
      </div>

      {shifts.length === 0 ? (
        <Empty className="border">
          <EmptyDescription>
            No shifts yet. Without one, attendance is recorded but flagged unscheduled:
            there is nothing to measure lateness or overtime against.
          </EmptyDescription>
        </Empty>
      ) : (
        <ShiftsTable
          shifts={shifts.map((shift) => ({
            id: shift.id,
            name: shift.name,
            isActive: shift.isActive,
            hoursLabel: `${minutesToTime(shift.startMinute)}–${minutesToTime(shift.endMinute)}`,
            overnight: shift.endMinute <= shift.startMinute,
            breakLabel: shift.unpaidBreakMinutes === 0 ? "-" : `${shift.unpaidBreakMinutes}m`,
            branchLabel: shift.branchId ? (branchName.get(shift.branchId) ?? "Unknown") : "All branches",
            assignmentCount: shift._count.assignments,
            canEdit: canWrite,
          }))}
        />
      )}
    </div>
  );
}
