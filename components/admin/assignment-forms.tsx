"use client";

import { useActionState, useEffect } from "react";
import { Loader2, Plus, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import type { FormState } from "@/lib/platform/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

const today = () => new Date().toISOString().slice(0, 10);

export function BranchAssignmentForm({
  action,
  branches,
  onSuccess,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  branches: { id: string; name: string }[];
  onSuccess?: () => void;
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(action, undefined);

  useEffect(() => {
    if (state?.success) {
      toast.success("Branch assigned successfully");
      onSuccess?.();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, onSuccess]);

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
  onSuccess,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  shifts: { id: string; label: string }[];
  onSuccess?: () => void;
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(action, undefined);

  useEffect(() => {
    if (state?.success) {
      toast.success("Shift assigned successfully");
      onSuccess?.();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, onSuccess]);

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

export function EndAssignmentButton({
  action,
  assignmentId,
  label = "assignment",
  onSuccess,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  assignmentId: string;
  label?: string;
  onSuccess?: () => void;
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(action, undefined);

  useEffect(() => {
    if (state?.success) {
      toast.success("Assignment ended");
      onSuccess?.();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, onSuccess]);

  return (
    <div className="ml-auto">
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              className="text-muted-foreground hover:text-destructive gap-1"
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
              End
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the {label} as ended as of today. Attendance already recorded will remain intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <form action={formAction}>
              <input type="hidden" name="assignmentId" value={assignmentId} />
              <AlertDialogAction
                type="submit"
                disabled={isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isPending && <Loader2 className="size-4 animate-spin mr-1.5" />}
                End {label}
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function RevokeDeviceButton({
  action,
  deviceIdentityId,
  deviceLabel,
  onSuccess,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  deviceIdentityId: string;
  deviceLabel?: string | null;
  onSuccess?: () => void;
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(action, undefined);

  useEffect(() => {
    if (state?.success) {
      toast.success("Device released successfully. Employee can now bind a new phone.");
      onSuccess?.();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, onSuccess]);

  return (
    <div className="ml-auto">
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              className="text-destructive hover:bg-destructive/10 border-destructive/30 gap-1.5"
            >
              {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Smartphone className="size-3.5" />}
              Release Device
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release bound device?</AlertDialogTitle>
            <AlertDialogDescription>
              This will unbind {deviceLabel ? `"${deviceLabel}"` : "this mobile device"} from this employee&apos;s account. The physical phone will be released and the employee will be permitted to register a new phone via OTP.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <form action={formAction}>
              <input type="hidden" name="deviceIdentityId" value={deviceIdentityId} />
              <AlertDialogAction
                type="submit"
                disabled={isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isPending && <Loader2 className="size-4 animate-spin mr-1.5" />}
                Release Device
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * One row per fingerprint terminal at a branch this employee is assigned to
 * — either the linked PIN with an unlink action, or a small inline form to
 * link one. Deliberately not bundled into the branch-assignment form itself:
 * the PIN is rarely known at the moment the branch is assigned, since it
 * only exists once someone has physically enrolled the employee on that
 * terminal, which can happen days later.
 */
export function DevicePinLinkRow({
  device,
  linkedPin,
  linkedIdentityId,
  linkAction,
  revokeAction,
  canWrite,
  onMutated,
}: {
  device: { id: string; serialNumber: string; label: string | null; branch: { name: string } };
  linkedPin: string | null;
  linkedIdentityId: string | null;
  linkAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  revokeAction: (prevState: FormState, formData: FormData) => Promise<FormState>;
  canWrite: boolean;
  onMutated?: () => void;
}) {
  const [linkState, linkFormAction, linkPending] = useActionState<FormState, FormData>(linkAction, undefined);
  const [revokeState, revokeFormAction, revokePending] = useActionState<FormState, FormData>(revokeAction, undefined);

  useEffect(() => {
    if (linkState?.success) {
      toast.success("PIN linked");
      onMutated?.();
    } else if (linkState?.error) {
      toast.error(linkState.error);
    }
  }, [linkState, onMutated]);

  useEffect(() => {
    if (revokeState?.success) {
      toast.success("PIN unlinked");
      onMutated?.();
    } else if (revokeState?.error) {
      toast.error(revokeState.error);
    }
  }, [revokeState, onMutated]);

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span>{device.branch.name}</span>
          {device.label && <span className="font-normal text-muted-foreground">· {device.label}</span>}
        </div>
        <p className="font-mono text-xs text-muted-foreground">{device.serialNumber}</p>
      </div>

      {linkedPin ? (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">PIN {linkedPin}</span>
          {canWrite && (
            <form action={revokeFormAction}>
              <input type="hidden" name="deviceIdentityId" value={linkedIdentityId ?? ""} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                disabled={revokePending}
                className="text-destructive hover:bg-destructive/10"
              >
                {revokePending ? <Loader2 className="size-3.5 animate-spin" /> : "Unlink"}
              </Button>
            </form>
          )}
        </div>
      ) : canWrite ? (
        <form action={linkFormAction} className="flex items-center gap-2">
          <input type="hidden" name="deviceId" value={device.id} />
          <Input name="pin" placeholder="PIN" required className="h-8 w-20 font-mono text-sm" />
          <Button type="submit" variant="outline" size="sm" disabled={linkPending}>
            {linkPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            Link
          </Button>
        </form>
      ) : (
        <span className="text-xs italic text-muted-foreground">Not linked</span>
      )}

      {linkState?.fieldErrors?.pin && (
        <p className="w-full text-xs text-destructive">{linkState.fieldErrors.pin}</p>
      )}
    </li>
  );
}

