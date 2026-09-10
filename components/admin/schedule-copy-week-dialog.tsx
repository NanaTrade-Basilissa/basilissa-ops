"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { copyWeeklyScheduleAction } from "@/lib/modules/attendance/actions";
import { shiftDateKey } from "@/lib/platform/date";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function formatWeekLabel(weekStartKey: string): string {
  const [y, m, d] = weekStartKey.split("-").map(Number);
  const start = new Date(Date.UTC(y!, m! - 1, d!));
  const end = new Date(Date.UTC(y!, m! - 1, d! + 6));
  const s = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(start);
  const e = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(end);
  return `${s} – ${e}`;
}

export function ScheduleCopyWeekDialog({
  branchId,
  branchName,
  activeWeekStart,
}: {
  branchId: string;
  branchName: string;
  activeWeekStart: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Preset previous weeks
  const prev1Week = shiftDateKey(activeWeekStart, -7);
  const prev2Weeks = shiftDateKey(activeWeekStart, -14);
  const prev3Weeks = shiftDateKey(activeWeekStart, -21);
  const prev4Weeks = shiftDateKey(activeWeekStart, -28);

  const [sourceWeek, setSourceWeek] = useState(prev1Week);
  const [overwrite, setOverwrite] = useState(false);

  function handleCopy() {
    startTransition(async () => {
      try {
        const result = await copyWeeklyScheduleAction(sourceWeek, activeWeekStart, branchId, overwrite);
        if (result.ok) {
          toast.success(result.message || "Weekly schedule copied successfully.");
          setOpen(false);
          router.refresh();
        } else {
          toast.error(result.error || "Failed to copy schedule.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to copy weekly schedule.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <Copy className="size-3.5" />
            <span>Copy Week</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copy Weekly Rota</DialogTitle>
          <DialogDescription>
            Duplicate shift overrides from a previous week into this week for {branchName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="sourceWeekSelect">Source Week (to copy from)</Label>
            <NativeSelect
              id="sourceWeekSelect"
              value={sourceWeek}
              onChange={(e) => setSourceWeek(e.target.value)}
            >
              <option value={prev1Week}>Previous Week ({formatWeekLabel(prev1Week)})</option>
              <option value={prev2Weeks}>2 Weeks Ago ({formatWeekLabel(prev2Weeks)})</option>
              <option value={prev3Weeks}>3 Weeks Ago ({formatWeekLabel(prev3Weeks)})</option>
              <option value={prev4Weeks}>4 Weeks Ago ({formatWeekLabel(prev4Weeks)})</option>
            </NativeSelect>
          </div>

          <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <div className="font-semibold text-foreground">Target Week:</div>
            <div className="text-muted-foreground">{formatWeekLabel(activeWeekStart)}</div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="overwriteExisting"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <Label htmlFor="overwriteExisting" className="text-xs font-normal text-muted-foreground cursor-pointer">
              Overwrite existing overrides in the target week if conflict occurs
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleCopy} disabled={isPending} className="gap-1.5">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
            Copy Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
