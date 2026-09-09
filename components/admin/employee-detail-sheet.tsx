"use client";

import { useCallback, useState, useTransition } from "react";
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
}: {
  employeeId: string;
  trigger: React.ReactElement;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      setDetail(await getEmployeeDetailAction(employeeId));
    });
  }, [employeeId]);

  return (
    <Sheet
      onOpenChange={(open) => {
        if (open) {
          load();
        } else {
          setDetail(null);
        }
      }}
    >
      <SheetTrigger render={trigger} />
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl lg:max-w-2xl">
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
              onMutated={load}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
