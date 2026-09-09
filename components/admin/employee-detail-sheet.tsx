"use client";

import { useCallback, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { getEmployeeDetailAction } from "@/lib/modules/employees/actions";
import { EmployeeDetailContent } from "@/components/admin/employee-detail-content";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type Detail = NonNullable<Awaited<ReturnType<typeof getEmployeeDetailAction>>>;

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
        if (open) load();
      }}
    >
      <SheetTrigger render={trigger} />
      <SheetContent className="w-full overflow-y-auto sm:w-1/2 sm:max-w-none">
        <SheetHeader>
          <SheetTitle>Employee</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          {isPending && !detail && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}
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
