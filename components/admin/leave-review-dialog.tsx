"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, X, CalendarCheck, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { reviewLeaveRequestAction } from "@/lib/modules/attendance/actions";

interface LeaveReviewDialogProps {
  leaveRequestId: string;
  employeeName: string;
  employeeCode: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  branchName?: string | null;
}

export function LeaveReviewDialog({
  leaveRequestId,
  employeeName,
  employeeCode,
  leaveType,
  startDate,
  endDate,
  daysCount,
  reason,
  branchName,
}: LeaveReviewDialogProps) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleDecision(decision: "APPROVED" | "REJECTED") {
    startTransition(async () => {
      try {
        const res = await reviewLeaveRequestAction(leaveRequestId, decision, notes);
        if (res.ok) {
          toast.success(res.message);
          setOpen(false);
        } else {
          toast.error(res.error || "Failed to submit review.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "An unexpected error occurred.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5 text-xs font-medium">
            <Clock className="size-3.5 text-amber-500" />
            <span>Review</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <CalendarCheck className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">Review Leave Request</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Decide whether to grant time off and roster DAY_OFF overrides.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          <div className="rounded-lg border border-border/80 bg-muted/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Employee</span>
              <span className="font-medium text-foreground">
                {employeeName} <span className="text-xs text-muted-foreground">({employeeCode})</span>
              </span>
            </div>

            {branchName && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Branch</span>
                <span className="text-xs text-foreground font-medium">{branchName}</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Leave Type</span>
              <Badge variant="outline" className="text-xs font-medium">
                {leaveType}
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Requested Period</span>
              <span className="text-xs font-semibold text-foreground">
                {startDate} to {endDate} ({daysCount} {daysCount === 1 ? "day" : "days"})
              </span>
            </div>

            <div className="pt-1">
              <span className="text-xs font-medium text-muted-foreground">Employee&apos;s Reason:</span>
              <p className="mt-1 text-xs text-foreground bg-background p-2 rounded border border-border/60 whitespace-pre-wrap">
                {reason}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="manager-notes" className="text-xs font-medium text-foreground">
              Manager Notes / Reason (Optional, shared with employee)
            </label>
            <Textarea
              id="manager-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Approved. Cover arranged with team."
              className="h-20 resize-none text-xs"
              disabled={isPending}
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleDecision("REJECTED")}
            disabled={isPending}
            className="gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
          >
            <X className="size-3.5" />
            <span>Decline Request</span>
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => handleDecision("APPROVED")}
              disabled={isPending}
              className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Check className="size-3.5" />
              <span>Approve Leave</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
