"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { getEmployeeDetailAction } from "@/lib/modules/employees/actions";
import { EmployeeDetailContent } from "@/components/admin/employee-detail-content";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type Detail = NonNullable<Awaited<ReturnType<typeof getEmployeeDetailAction>>>;

function EmployeeDetailSkeleton() {
  return (
    <div className="space-y-6 pt-2">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>
      </div>
      <div className="space-y-4 rounded-xl border border-border p-4">
        <Skeleton className="h-5 w-20" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-3 rounded-xl border border-border p-4">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}

export function EmployeeDetailSheet({
  employeeId,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  employeeId: string | null;
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setInternalOpen;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    if (!employeeId) return;
    startTransition(async () => {
      setDetail(await getEmployeeDetailAction(employeeId));
    });
  }, [employeeId]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setDetail(null);
    }
  };

  useEffect(() => {
    if (open) {
      load();
    }
  }, [open, load]);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      {trigger ? <SheetTrigger render={trigger} /> : null}
      <SheetContent className="w-full data-[side=right]:w-full sm:max-w-full data-[side=right]:sm:max-w-full lg:w-1/3 data-[side=right]:lg:w-1/3 lg:max-w-none data-[side=right]:lg:max-w-none overflow-y-auto">
        <SheetHeader>

          <SheetTitle>Employee</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          {(isPending || !detail) && <EmployeeDetailSkeleton />}
          {detail && (
            <EmployeeDetailContent
              employee={detail.employee}
              branches={detail.branches}
              shifts={detail.shifts}
              shiftAssignments={detail.shiftAssignments}
              canWrite={detail.canWrite}
              canSchedule={detail.canSchedule}
              attendanceEnabled={detail.attendanceEnabled}
              attendanceHistory={detail.attendanceHistory}
              branchDevices={detail.branchDevices}
              onMutated={load}
            />

          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
