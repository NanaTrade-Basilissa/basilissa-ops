import type { Metadata } from "next";
import { CalendarClock, Plus } from "lucide-react";
import { can, hasAnyPermission, requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { createShift } from "@/lib/modules/employees/actions";
import { listShifts } from "@/lib/modules/employees/server";
import { minutesToTime } from "@/lib/modules/employees/validation";
import { prisma } from "@/lib/platform/prisma";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ShiftDialog } from "@/components/admin/shift-dialog";
import { ShiftsTable } from "@/components/admin/shifts-table";
import { requireFeature } from "@/lib/platform/features-guard";

export const metadata: Metadata = { title: "Shifts" };
export const dynamic = "force-dynamic";

export default async function ShiftsPage() {
  requireFeature("attendance");

  const { actor, scope } = await requireAnyBranchPermission("schedule:read");
  const canWriteAny = hasAnyPermission(actor, "schedule:write");
  const allowGlobal = can(actor, "schedule:write");

  const branchFilter =
    scope.kind === "branches"
      ? { id: { in: scope.branchIds } }
      : scope.kind === "none"
        ? { id: { in: [] } }
        : undefined;

  const [shifts, branches, allBranchesForNames] = await Promise.all([
    listShifts(scope),
    prisma.branch.findMany({
      where: branchFilter,
      select: { id: true, name: true, isActive: true },
    }),
    prisma.branch.findMany({ select: { id: true, name: true } }),
  ]);
  const branchName = new Map(allBranchesForNames.map((b) => [b.id, b.name]));
  const assignableBranches = branches.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name }));
  const canCreate = canWriteAny && (allowGlobal || assignableBranches.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Shifts</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Reusable templates, resolved against each branch&rsquo;s timezone.
          </p>
        </div>
        {canCreate && (
          <ShiftDialog
            action={createShift}
            branches={assignableBranches}
            allowGlobal={allowGlobal}
            submitLabel="Create shift"
            title="New shift"
            description="Reusable templates, resolved against each branch's timezone."
            trigger={
              <Button>
                <Plus className="size-4" />
                New shift
              </Button>
            }
          />
        )}
      </div>

      {shifts.length === 0 ? (
        <Empty className="border py-12">
          <EmptyMedia variant="icon">
            <CalendarClock className="size-4" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No shifts defined yet</EmptyTitle>
            <EmptyDescription>
              Without a shift template, attendance is recorded but flagged unscheduled with nothing to measure lateness or overtime against.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ShiftsTable
          branches={assignableBranches}
          allowGlobal={allowGlobal}
          shifts={shifts.map((shift) => ({
            id: shift.id,
            name: shift.name,
            isActive: shift.isActive,
            hoursLabel: `${minutesToTime(shift.startMinute)}–${minutesToTime(shift.endMinute)}`,
            overnight: shift.endMinute <= shift.startMinute,
            breakLabel: shift.unpaidBreakMinutes === 0 ? "-" : `${shift.unpaidBreakMinutes}m`,
            branchLabel: shift.branchId ? (branchName.get(shift.branchId) ?? "Unknown") : "All branches",
            assignmentCount: shift._count.assignments,
            canEdit:
              canWriteAny &&
              (shift.branchId === null
                ? allowGlobal
                : can(actor, "schedule:write", { branchId: shift.branchId })),
            branchId: shift.branchId ?? "",
            startTime: minutesToTime(shift.startMinute),
            endTime: minutesToTime(shift.endMinute),
            unpaidBreakMinutes: shift.unpaidBreakMinutes,
          }))}
        />
      )}
    </div>
  );
}
