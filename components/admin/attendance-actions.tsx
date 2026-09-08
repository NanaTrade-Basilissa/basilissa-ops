"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2, PenLine, Plus } from "lucide-react";
import type { AttendanceActionState } from "@/lib/modules/attendance/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Action = (prev: AttendanceActionState, formData: FormData) => Promise<AttendanceActionState>;

const MANUAL_REASONS = [
  ["DEVICE_OFFLINE", "Terminal was offline"],
  ["PHONE_UNAVAILABLE", "Employee had no phone"],
  ["NEW_EMPLOYEE_NOT_ENROLLED", "New employee, not enrolled yet"],
  ["FORGOT_TO_PUNCH", "Employee forgot to punch"],
  ["SYSTEM_OUTAGE", "System outage"],
  ["OTHER", "Other"],
] as const;

const CORRECTION_REASONS = [
  ["DEVICE_CLOCK_WRONG", "Device clock was wrong"],
  ["WRONG_EMPLOYEE", "Recorded against the wrong person"],
  ["DUPLICATE_PUNCH", "Duplicate punch"],
  ["FORGOT_TO_PUNCH", "Employee forgot to punch"],
  ["DISPUTE_RESOLVED", "Dispute resolved"],
  ["OTHER", "Other"],
] as const;

function Result({ state }: { state: AttendanceActionState }) {
  if (state?.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    );
  }
  if (state?.saved) {
    return (
      <Alert>
        <CheckCircle2 className="size-4" />
        <AlertDescription>{state.saved}</AlertDescription>
      </Alert>
    );
  }
  return null;
}

export function ManualEntryForm({ action, defaultDate }: { action: Action; defaultDate: string }) {
  const [state, formAction, isPending] = useActionState<AttendanceActionState, FormData>(
    action,
    undefined,
  );
  const [reason, setReason] = useState<string>("DEVICE_OFFLINE");

  return (
    <form action={formAction} className="space-y-4">
      <Result state={state} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="occurredAt">When it happened</Label>
          <Input
            id="occurredAt"
            name="occurredAt"
            type="datetime-local"
            required
            defaultValue={`${defaultDate}T09:00`}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reasonCode">Why by hand</Label>
          <NativeSelect
            id="reasonCode"
            name="reasonCode"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="min-w-56"
          >
            {MANUAL_REASONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reasonText">
          Details {reason === "OTHER" && <span className="text-destructive">(required)</span>}
        </Label>
        <Input
          id="reasonText"
          name="reasonText"
          required={reason === "OTHER"}
          placeholder="What happened"
        />
      </div>

      {/* Direction is not offered. A manager saying "clock-in" does not make it
          one if the person was already clocked in — the sequence decides. */}
      <p className="text-xs text-muted-foreground">
        Whether this counts as a clock-in or clock-out is worked out from the punches
        already recorded, so it cannot contradict them. You cannot record your own
        attendance.
      </p>

      <Button type="submit" variant="outline" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        Record
      </Button>
    </form>
  );
}

export function CorrectionForm({
  action,
  events,
}: {
  action: Action;
  events: { id: string; label: string }[];
}) {
  const [state, formAction, isPending] = useActionState<AttendanceActionState, FormData>(
    action,
    undefined,
  );
  const [operation, setOperation] = useState("ADJUST_TIME");
  const [reason, setReason] = useState("DEVICE_CLOCK_WRONG");

  return (
    <form action={formAction} className="space-y-4">
      <Result state={state} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="operation">What to do</Label>
          <NativeSelect
            id="operation"
            name="operation"
            value={operation}
            onChange={(event) => setOperation(event.target.value)}
            className="min-w-48"
          >
            <option value="ADJUST_TIME">Correct the time</option>
            <option value="VOID_EVENT">Set the punch aside</option>
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="targetEventId">Which punch</Label>
          <NativeSelect id="targetEventId" name="targetEventId" required className="min-w-64">
            <option value="">Choose…</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.label}
              </option>
            ))}
          </NativeSelect>
        </div>

        {operation === "ADJUST_TIME" && (
          <div className="space-y-1.5">
            <Label htmlFor="correctedOccurredAt">Should have been</Label>
            <Input
              id="correctedOccurredAt"
              name="correctedOccurredAt"
              type="datetime-local"
              required
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="correctionReason">Reason</Label>
          <NativeSelect
            id="correctionReason"
            name="reasonCode"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="min-w-56"
          >
            {CORRECTION_REASONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="correctionText">Details</Label>
          <Input id="correctionText" name="reasonText" required placeholder="Why this is being changed" />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        The original punch is kept and stays visible. Corrections are added, never
        applied over the top. Larger changes, ones creating overtime, and ones reaching
        back more than a week need a second approver.
      </p>

      <Button type="submit" variant="outline" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <PenLine className="size-4" />}
        Apply correction
      </Button>
    </form>
  );
}
