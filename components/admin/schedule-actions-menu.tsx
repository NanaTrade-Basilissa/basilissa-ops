"use client";

import { useState } from "react";
import { ArrowRightLeft, ChevronDown, Copy, Repeat, Settings2, Sparkles, Users, Zap, ZapOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ScheduleAssignPatternDialog,
  type AssignablePattern,
  type PatternCandidate,
} from "@/components/admin/schedule-assign-pattern-dialog";
import { AutoRotaDialog, GenerateWeekDialog } from "@/components/admin/schedule-pattern-mode-dialogs";
import type { CycleShift } from "@/components/admin/pattern-cycle";
import { ScheduleCopyWeekDialog } from "@/components/admin/schedule-copy-week-dialog";
import { ScheduleCoverDialog, type CoverCandidate } from "@/components/admin/schedule-cover-dialog";
import { ScheduleBulkAssignDialog } from "@/components/admin/schedule-bulk-assign-dialog";

type Dialog = "copy" | "cover" | "bulk" | "pattern" | "generate" | "auto" | null;

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
  autoRota,
  weekLabel,
  patterns,
  patternShifts,
  patternCandidates,
}: {
  branchId: string;
  branchName: string;
  weekStartKey: string;
  days: { dateKey: string; dayName: string; formattedDay: string; holidayName: string | null }[];
  shifts: { id: string; name: string; startMinute: number; endMinute: number }[];
  branchEmployees: { id: string; name: string; employeeCode: string | null }[];
  coverCandidates: CoverCandidate[];
  autoRota: boolean;
  weekLabel: string;
  patterns: AssignablePattern[];
  patternShifts: CycleShift[];
  patternCandidates: PatternCandidate[];
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
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setOpen("pattern")}>
            <Repeat className="size-4" />
            Assign rota pattern
          </DropdownMenuItem>
          {!autoRota && (
            <DropdownMenuItem onClick={() => setOpen("generate")}>
              <Sparkles className="size-4" />
              Generate week from patterns
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setOpen("auto")}>
            {autoRota ? <ZapOff className="size-4" /> : <Zap className="size-4" />}
            {autoRota ? "Turn Auto rota off" : "Turn Auto rota on"}
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
      {open === "pattern" && (
        <ScheduleAssignPatternDialog
          branchId={branchId}
          branchName={branchName}
          weekStartKey={weekStartKey}
          patterns={patterns}
          shifts={patternShifts}
          employees={patternCandidates}
          open
          onOpenChange={onOpenChange("pattern")}
        />
      )}
      <GenerateWeekDialog
        branchId={branchId}
        branchName={branchName}
        weekStartKey={weekStartKey}
        weekLabel={weekLabel}
        open={open === "generate"}
        onOpenChange={onOpenChange("generate")}
      />
      <AutoRotaDialog
        branchId={branchId}
        branchName={branchName}
        autoRota={autoRota}
        open={open === "auto"}
        onOpenChange={onOpenChange("auto")}
      />
    </>
  );
}
