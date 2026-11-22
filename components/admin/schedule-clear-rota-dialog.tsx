"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { clearBranchWeekAction } from "@/lib/modules/attendance/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ScheduleClearRotaDialog({
  branchId,
  branchName,
  weekStartKey,
  weekLabel,
  open,
  onOpenChange,
}: {
  branchId: string;
  branchName: string;
  weekStartKey: string;
  weekLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmText, setConfirmText] = useState("");

  const isConfirmed = confirmText.trim().toUpperCase() === "CLEAR";

  function handleOpenChange(next: boolean) {
    if (!next) setConfirmText("");
    onOpenChange(next);
  }

  function handleClear() {
    if (!isConfirmed) return;
    startTransition(async () => {
      const res = await clearBranchWeekAction({ branchId, weekStartKey });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to clear rota.");
        return;
      }

      const parts: string[] = [];
      if (res.clearedExceptions) parts.push(`${res.clearedExceptions} daily shift(s)`);
      if (res.clearedShiftAssignments) parts.push(`${res.clearedShiftAssignments} recurring assignment(s)`);
      if (res.clearedPatterns) parts.push(`${res.clearedPatterns} pattern assignment(s)`);

      toast.success(
        parts.length > 0
          ? `Cleared ${parts.join(", ")} for ${branchName}.`
          : `${branchName} rota board is already clear for this week.`,
      );
      setConfirmText("");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            Clear rota board — {branchName}
          </DialogTitle>
          <DialogDescription>
            This clears upcoming scheduled shifts, overrides, and active patterns for{" "}
            <span className="font-medium text-foreground">{branchName}</span> from today onward
            within <span className="font-medium text-foreground">{weekLabel}</span> so you can start fresh.
            Past days, earlier weeks, and attendance history are never modified.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="clear-rota-confirm" className="text-xs text-muted-foreground">
            Type <span className="font-mono font-semibold text-foreground">CLEAR</span> to confirm
          </Label>
          <Input
            id="clear-rota-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && isConfirmed && !isPending) {
                e.preventDefault();
                handleClear();
              }
            }}
            placeholder="Type CLEAR"
            autoComplete="off"
            disabled={isPending}
            className="h-9 text-xs font-mono"
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleClear}
            disabled={!isConfirmed || isPending}
            className="gap-1.5"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Clear rota
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
