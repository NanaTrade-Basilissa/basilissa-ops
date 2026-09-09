"use client";

import { useActionState, useEffect } from "react";
import { Loader2, Save } from "lucide-react";
import type { FormState } from "@/lib/platform/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function ShiftForm({
  action,
  branches,
  defaultValues,
  submitLabel,
  onSuccess,
  allowGlobal = true,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  branches: { id: string; name: string }[];
  defaultValues?: {
    name: string;
    branchId: string;
    startTime: string;
    endTime: string;
    unpaidBreakMinutes: number;
    isActive: boolean;
  };
  submitLabel: string;
  onSuccess?: () => void;
  allowGlobal?: boolean;
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(action, undefined);
  const errors = state?.fieldErrors ?? {};

  useEffect(() => {
    if (state?.success) onSuccess?.();
  }, [state, onSuccess]);

  return (
    <form action={formAction} className="max-w-lg space-y-5" noValidate>
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required defaultValue={defaultValues?.name} placeholder="Day" />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="startTime">Starts</Label>
          <Input
            id="startTime"
            name="startTime"
            type="time"
            required
            defaultValue={defaultValues?.startTime ?? "08:00"}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="endTime">Ends</Label>
          <Input
            id="endTime"
            name="endTime"
            type="time"
            required
            defaultValue={defaultValues?.endTime ?? "17:00"}
          />
          {errors.endMinute && <p className="text-xs text-destructive">{errors.endMinute}</p>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        An end earlier than the start means the shift runs past midnight. Those are
        anchored to the day they <em>begin</em>, so a night is never split across two
        work dates.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="unpaidBreakMinutes">Unpaid break</Label>
        <Input
          id="unpaidBreakMinutes"
          name="unpaidBreakMinutes"
          type="number"
          min={0}
          max={240}
          className="max-w-28"
          defaultValue={defaultValues?.unpaidBreakMinutes ?? 0}
        />
        <p className="text-xs text-muted-foreground">
          Minutes. How this is applied depends on the break policy in attendance policy.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="branchId">Branch</Label>
        <NativeSelect
          id="branchId"
          name="branchId"
          defaultValue={defaultValues?.branchId ?? (!allowGlobal && branches.length === 1 ? branches[0].id : "")}
        >
          {allowGlobal && <option value="">Available to every branch</option>}
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="flex items-center gap-3">
        <Switch id="isActive" name="isActive" defaultChecked={defaultValues?.isActive ?? true} />
        <Label htmlFor="isActive">Available for new assignments</Label>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        {submitLabel}
      </Button>
    </form>
  );
}
