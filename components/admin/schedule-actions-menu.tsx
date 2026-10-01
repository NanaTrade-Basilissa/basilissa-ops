"use client";

import { useState } from "react";
import { ArrowRightLeft, ChevronDown, Copy, Settings2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScheduleCopyWeekDialog } from "@/components/admin/schedule-copy-week-dialog";
import { ScheduleCoverDialog, type CoverCandidate } from "@/components/admin/schedule-cover-dialog";
import { ScheduleBulkAssignDialog } from "@/components/admin/schedule-bulk-assign-dialog";

type Dialog = "copy" | "cover" | "bulk" | null;

/**
 * Every rota-changing action behind one button, so the controls card stays
 * about what you are looking at (branch and week) and does not grow sideways
 * as actions are added.
 */
export function ScheduleActionsMenu({
  branchId,
  branchName,
  weekStartKey,
  days,
  shifts,
  branchEmployees,
  coverCandidates,
}: {
  branchId: string;
  branchName: string;
  weekStartKey: string;
  days: { dateKey: string; dayName: string; formattedDay: string; holidayName: string | null }[];
  shifts: { id: string; name: string; startMinute: number; endMinute: number }[];
  branchEmployees: { id: string; name: string; employeeCode: string | null }[];
  coverCandidates: CoverCandidate[];
}) {
  const [open, setOpen] = useState<Dialog>(null);
  const onOpenChange = (which: Exclude<Dialog, null>) => (next: boolean) => setOpen(next ? which : null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" className="gap-1.5">
              <Settings2 className="size-3.5" />
              <span>Manage rota</span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem onClick={() => setOpen("copy")}>
            <Copy className="size-4" />
            Copy week
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen("cover")}>
            <ArrowRightLeft className="size-4" />
            Cover shift
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen("bulk")}>
            <Users className="size-4" />
            Bulk assign
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ScheduleCopyWeekDialog
        branchId={branchId}
        branchName={branchName}
        activeWeekStart={weekStartKey}
        open={open === "copy"}
        onOpenChange={onOpenChange("copy")}
      />
      <ScheduleCoverDialog
        branchId={branchId}
        branchName={branchName}
        days={days}
        shifts={shifts}
        candidates={coverCandidates}
        open={open === "cover"}
        onOpenChange={onOpenChange("cover")}
      />
      <ScheduleBulkAssignDialog
        branchId={branchId}
        branchName={branchName}
        employees={branchEmployees}
        shifts={shifts}
        activeWeekStart={weekStartKey}
        open={open === "bulk"}
        onOpenChange={onOpenChange("bulk")}
      />
    </>
  );
}
