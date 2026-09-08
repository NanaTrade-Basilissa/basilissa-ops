"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import type { FormState } from "@/lib/platform/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";

const today = () => new Date().toISOString().slice(0, 10);

export function BranchAssignmentForm({
  action,
  branches,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  branches: { id: string; name: string }[];
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(action, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
      {state?.error && (
        <Alert variant="destructive" className="w-full">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="branchId">Branch</Label>
        <NativeSelect id="branchId" name="branchId" required className="min-w-48">
          <option value="">Choose…</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="branchValidFrom">From</Label>
        <Input id="branchValidFrom" name="validFrom" type="date" required defaultValue={today()} />
      </div>

      <div className="flex items-center gap-2 pb-2">
        <Switch id="isPrimary" name="isPrimary" />
        <Label htmlFor="isPrimary">Primary</Label>
      </div>

      <Button type="submit" variant="outline" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        Assign
      </Button>
    </form>
  );
}

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

export function ShiftAssignmentForm({
  action,
  shifts,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  shifts: { id: string; label: string }[];
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(action, undefined);

  return (
    <form action={formAction} className="space-y-3 border-t border-border pt-4">
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="shiftId">Shift</Label>
          <NativeSelect id="shiftId" name="shiftId" required className="min-w-56">
            <option value="">Choose…</option>
            {shifts.map((shift) => (
              <option key={shift.id} value={shift.id}>
                {shift.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="shiftValidFrom">From</Label>
          <Input id="shiftValidFrom" name="validFrom" type="date" required defaultValue={today()} />
        </div>
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Assign
        </Button>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Days worked</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <label
              key={day.value}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm has-checked:border-primary has-checked:bg-primary/10"
            >
              <input type="checkbox" name="daysOfWeek" value={day.value} className="sr-only" />
              {day.label}
            </label>
          ))}
        </div>
        {/* Assigning a shift with no days would silently leave the person
            unscheduled, so the server rejects it rather than accepting a rota
            that never applies. */}
        <p className="text-xs text-muted-foreground">Pick at least one day.</p>
      </fieldset>
    </form>
  );
}
