"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Loader2 } from "lucide-react";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { resolveAttendanceDay } from "@/lib/modules/attendance/actions";

export function ResolveExceptionDialog({
  employeeId,
  employeeName,
  branchId,
  dateKey,
  flags,
  calculatedOvertimeMinutes,
  payableOvertimeMinutes,
  canAuthorizeOvertime,
}: {
  employeeId: string;
  employeeName: string;
  branchId: string;
  dateKey: string;
  flags: string[];
  calculatedOvertimeMinutes: number;
  payableOvertimeMinutes: number;
  canAuthorizeOvertime: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [overtimeMins, setOvertimeMins] = useState<number>(
    payableOvertimeMinutes > 0 ? payableOvertimeMinutes : calculatedOvertimeMinutes,
  );
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!notes.trim()) {
      toast.error("Please provide a note explaining the resolution.");
      return;
    }

    startTransition(async () => {
      const result = await resolveAttendanceDay(employeeId, branchId, dateKey, {
        notes: notes.trim(),
        payableOvertimeMinutes: canAuthorizeOvertime ? overtimeMins : undefined,
      });

      if (!result.success) {
        toast.error(result.error ?? "Failed to resolve exception.");
        return;
      }

      toast.success("Attendance day resolved and settled successfully.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700">
            <CheckCircle className="size-4" />
            Resolve Exception
          </Button>
        }
      />

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resolve Attendance Exception</DialogTitle>
          <DialogDescription>
            Acknowledge flags and sign off on this day for {employeeName} on {dateKey}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {flags.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Active Flags</Label>
              <div className="flex flex-wrap gap-1.5">
                {flags.map((flag) => (
                  <Badge key={flag} variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300">
                    {flag.toLowerCase().replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2 rounded-lg border border-border p-3">
            <Label htmlFor="payableOvertime" className="text-sm font-medium">
              Payable Overtime
            </Label>
            {canAuthorizeOvertime ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Input
                    id="payableOvertime"
                    type="number"
                    min={0}
                    max={720}
                    value={overtimeMins}
                    onChange={(e) => setOvertimeMins(Number(e.target.value))}
                    className="w-28"
                  />
                  <span className="text-sm text-muted-foreground">minutes</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Calculated overtime was {calculatedOvertimeMinutes}m. You have authority to authorize payable overtime.
                </p>
              </div>
            ) : (
              <div className="space-y-1 text-xs text-muted-foreground">
                <div>
                  Calculated: <span className="font-semibold text-foreground">{calculatedOvertimeMinutes}m</span>
                </div>
                <p className="italic text-amber-700 dark:text-amber-400">
                  Only Area Managers and Administrators may authorize payable overtime unless enabled in policy.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Resolution Notes *</Label>
            <Textarea
              id="notes"
              rows={3}
              placeholder="e.g. Reviewed with shift lead; approved manual punch due to terminal failure."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              required
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Resolve & Settle Day
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
