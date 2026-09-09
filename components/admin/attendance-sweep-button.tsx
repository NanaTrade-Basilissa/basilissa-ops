"use client";

import { useState, useTransition } from "react";
import { ClockAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { runDailyAttendanceSweepAction } from "@/lib/modules/attendance/actions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function AttendanceSweepButton() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSweep = () => {
    startTransition(async () => {
      try {
        const summary = await runDailyAttendanceSweepAction();
        toast.success(
          `Auto-close sweep finished: ${summary.closed} shift(s) closed, ${summary.examined} examined.`
        );
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to run auto-close sweep.");
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button size="sm" variant="outline" className="gap-1.5 text-xs">
            <ClockAlert className="size-3.5 text-purple-600 dark:text-purple-400" />
            Auto-close sweep
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Run shift auto-close sweep?</AlertDialogTitle>
          <AlertDialogDescription>
            This scans for unclosed shifts from previous days exceeding the policy grace period.
            Missing clock-outs will be automatically closed, flagged as AUTO_CLOSED, and settled
            with zero unverified overtime.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleSweep}
            disabled={isPending}
            className="bg-purple-600 text-white hover:bg-purple-700"
          >
            {isPending && <Loader2 className="size-4 animate-spin mr-1.5" />}
            Run sweep now
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
