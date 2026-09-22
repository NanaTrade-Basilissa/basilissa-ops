"use client";

import { useActionState, useEffect } from "react";
import { Loader2, Save } from "lucide-react";
import type { DeviceFormState } from "@/lib/modules/devices/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NativeSelect } from "@/components/ui/native-select";

export function DeviceForm({
  action,
  branches,
  defaultValues,
  submitLabel,
  onSuccess,
}: {
  action: (prevState: DeviceFormState, formData: FormData) => Promise<DeviceFormState>;
  branches: { id: string; name: string }[];
  defaultValues?: {
    serialNumber: string;
    branchId: string;
    label: string | null;
    isActive: boolean;
  };
  submitLabel: string;
  onSuccess?: () => void;
}) {
  const [state, formAction, isPending] = useActionState<DeviceFormState, FormData>(action, undefined);

  useEffect(() => {
    if (state?.success) onSuccess?.();
  }, [state, onSuccess]);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="serialNumber">Serial number</Label>
        {defaultValues ? (
          <>
            <Input id="serialNumber" value={defaultValues.serialNumber} disabled className="font-mono" />
            <p className="text-xs text-muted-foreground">
              Fixed once registered — retire this unit and register a new one instead of changing it.
            </p>
          </>
        ) : (
          <>
            <Input id="serialNumber" name="serialNumber" required placeholder="GED7234700295" className="font-mono" />
            <p className="text-xs text-muted-foreground">
              From the terminal&apos;s Comm. → PC Connection screen, or its handshake push.
            </p>
          </>
        )}
        {state?.fieldErrors?.serialNumber && (
          <p className="text-xs text-destructive">{state.fieldErrors.serialNumber}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="branchId">Branch</Label>
        <NativeSelect id="branchId" name="branchId" required defaultValue={defaultValues?.branchId ?? ""}>
          <option value="" disabled>
            Select a branch
          </option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </NativeSelect>
        {state?.fieldErrors?.branchId && <p className="text-xs text-destructive">{state.fieldErrors.branchId}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="label">Label</Label>
        <Input
          id="label"
          name="label"
          defaultValue={defaultValues?.label ?? ""}
          placeholder="e.g. Accra Mall, staff entrance"
        />
        {state?.fieldErrors?.label && <p className="text-xs text-destructive">{state.fieldErrors.label}</p>}
      </div>

      <div className="flex items-center gap-3">
        <Switch id="isActive" name="isActive" defaultChecked={defaultValues?.isActive ?? true} />
        <div>
          <Label htmlFor="isActive" className="mb-0">
            Active
          </Label>
          <p className="text-xs text-muted-foreground">
            Inactive devices still push data, but it quarantines instead of resolving to anyone.
          </p>
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        {submitLabel}
      </Button>
    </form>
  );
}
