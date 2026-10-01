"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import type { FormState } from "@/lib/platform/forms";
import { saveHolidayAction } from "@/lib/modules/attendance/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type HolidayDialogValues = { id: string; dateKey: string; name: string; confirmed: boolean };

export function HolidayDialog({
  holiday,
  defaultDateKey,
  open,
  onOpenChange,
}: {
  /** Absent to add a new holiday. */
  holiday?: HolidayDialogValues;
  defaultDateKey?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    saveHolidayAction.bind(null, holiday?.id ?? null),
    undefined,
  );
  const errors = state?.fieldErrors ?? {};
  // Controlled, so a rejected save (a date that is already a holiday) keeps
  // what was typed: React resets uncontrolled fields after every action.
  const [dateKey, setDateKey] = useState(holiday?.dateKey ?? defaultDateKey ?? "");
  const [name, setName] = useState(holiday?.name ?? "");
  const [confirmed, setConfirmed] = useState(holiday?.confirmed ?? true);

  useEffect(() => {
    if (state?.success) {
      toast.success(holiday ? "Holiday updated" : "Holiday added");
      onOpenChange(false);
    }
  }, [state, holiday, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{holiday ? "Edit holiday" : "Add holiday"}</DialogTitle>
          <DialogDescription>
            Staff on office hours are off on this day. Branch rotas and anyone given a shift that day still work.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-5">
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

          <div className="space-y-1.5">
            <Label htmlFor="dateKey">Date</Label>
            <Input
              id="dateKey"
              name="dateKey"
              type="date"
              required
              className="max-w-48"
              value={dateKey}
              onChange={(e) => setDateKey(e.target.value)}
              aria-invalid={Boolean(errors.dateKey)}
            />
            {errors.dateKey && <p className="text-xs text-destructive">{errors.dateKey}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              required
              placeholder="e.g. Republic Day"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <Switch
                id="confirmed"
                name="confirmed"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <Label htmlFor="confirmed">Date confirmed</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave off while the date is an estimate, such as Eid before it is announced. The holiday
              applies either way; this only flags it for checking.
            </p>
          </div>

          <Button type="submit" disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {holiday ? "Save changes" : "Add holiday"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
