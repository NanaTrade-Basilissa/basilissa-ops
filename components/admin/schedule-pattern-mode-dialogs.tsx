"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { generatePatternWeekAction, setAutoRotaAction } from "@/lib/modules/attendance/actions";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

/** Turns a branch's Auto rota on or off, saying plainly what changes. */
export function AutoRotaDialog({
  branchId,
  branchName,
  autoRota,
  open,
  onOpenChange,
}: DialogProps & { branchId: string; branchName: string; autoRota: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const next = !autoRota;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Turn Auto rota {next ? "on" : "off"} for {branchName}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {next
              ? "Patterns will set this branch's schedule by themselves, every day, with nothing to generate. Changes you make in the grid still win for that day."
              : "Patterns will stop setting the schedule. Each week then needs Generate week, and any week nobody generates falls back to people's recurring shift, such as 8-5. Weeks already generated are kept."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await setAutoRotaAction(branchId, next);
                if (result.ok) {
                  toast.success(`Auto rota ${next ? "on" : "off"} for ${branchName}.`);
                  router.refresh();
                } else {
                  toast.error(result.error ?? "Could not change Auto rota.");
                }
                onOpenChange(false);
              })
            }
          >
            Turn {next ? "on" : "off"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Writes the shown week's patterns into the grid, for a manual-rota branch. */
export function GenerateWeekDialog({
  branchId,
  branchName,
  weekStartKey,
  weekLabel,
  open,
  onOpenChange,
}: DialogProps & { branchId: string; branchName: string; weekStartKey: string; weekLabel: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [overwrite, setOverwrite] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Generate {weekLabel} at {branchName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Fills the grid from each person&apos;s rota pattern: their shifts, and their days off as days off. You can
            change any day afterwards.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <Switch id="generateOverwrite" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            <Label htmlFor="generateOverwrite">Replace days already changed this week</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Off: days with an edit, approved leave or a cover shift are left alone.
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await generatePatternWeekAction(branchId, weekStartKey, overwrite);
                if (result.ok) {
                  toast.success(
                    result.people
                      ? `Generated ${result.written} days for ${result.people} ${result.people === 1 ? "person" : "people"}` +
                          (result.skipped ? `; kept ${result.skipped} already changed.` : ".")
                      : "Nobody here is on a rota pattern this week.",
                  );
                  router.refresh();
                } else {
                  toast.error(result.error ?? "Could not generate the week.");
                }
                onOpenChange(false);
              })
            }
          >
            Generate
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
