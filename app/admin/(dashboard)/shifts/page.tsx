import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { can, requirePermission } from "@/lib/modules/identity/server";
import { listShifts } from "@/lib/modules/employees/server";
import { minutesToTime } from "@/lib/modules/employees/validation";
import { prisma } from "@/lib/platform/prisma";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireFeature } from "@/lib/platform/features-guard";

export const metadata: Metadata = { title: "Shifts" };
export const dynamic = "force-dynamic";

export default async function ShiftsPage() {
  requireFeature("attendance");

  const actor = await requirePermission("schedule:read");
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
        {can(actor, "schedule:write") && (
          <Link href="/admin/shifts/new" className={buttonVariants()}>
            <Plus className="size-4" />
            New shift
          </Link>
        )}
      </div>

      {shifts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No shifts yet. Without one, attendance is recorded but flagged unscheduled:
          there is nothing to measure lateness or overtime against.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead>Break</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>In use</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shifts.map((shift) => {
              const overnight = shift.endMinute <= shift.startMinute;
              return (
                <TableRow key={shift.id}>
                  <TableCell>
                    {can(actor, "schedule:write") ? (
                      <Link href={`/admin/shifts/${shift.id}/edit`} className="font-medium underline">
                        {shift.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{shift.name}</span>
                    )}
                    {!shift.isActive && (
                      <Badge variant="outline" className="ml-2">
                        inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {minutesToTime(shift.startMinute)}–{minutesToTime(shift.endMinute)}
                    {overnight && (
                      <Badge variant="outline" className="ml-2" title="Anchored to the day it starts">
                        overnight
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {shift.unpaidBreakMinutes === 0 ? "-" : `${shift.unpaidBreakMinutes}m`}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {shift.branchId ? (branchName.get(shift.branchId) ?? "Unknown") : "All branches"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {shift._count.assignments}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
