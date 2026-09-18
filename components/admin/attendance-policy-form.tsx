"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Save, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { PolicyFormState } from "@/lib/modules/attendance/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export type PolicyValues = {
  graceInMinutes: number;
  graceOutMinutes: number;
  overtimeThresholdMinutes: number;
  breakPolicy: "EXPLICIT_PUNCH" | "AUTO_DEDUCT";
  autoDeductMinutes: number;
  autoDeductAfterMinutes: number;
  roundingMinutes: number;
  autoCloseGraceMinutes: number;
  dedupWindowMinutes: number;
  maxManualEntryDays: number;
  branchManagerCanAuthorizeOvertime: boolean;
  isProvisional: boolean;
};

function Field({
  name,
  label,
  hint,
  defaultValue,
  min,
  max,
  error,
  suffix = "minutes",
}: {
  name: string;
  label: string;
  hint: string;
  defaultValue: number;
  min: number;
  max: number;
  error?: string;
  suffix?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={name}
          name={name}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          defaultValue={defaultValue}
          className="max-w-28"
          aria-describedby={`${name}-hint`}
        />
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </div>
      <p id={`${name}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function AttendancePolicyForm({
  action,
  values,
  canEdit,
  branchId,
  branchName,
}: {
  action: (prevState: PolicyFormState, formData: FormData) => Promise<PolicyFormState>;
  values: PolicyValues;
  canEdit: boolean;
  branchId?: string | null;
  branchName?: string;
}) {
  const [state, formAction, isPending] = useActionState<PolicyFormState, FormData>(
    action,
    undefined,
  );

  const [breakPolicy, setBreakPolicy] = useState(values.breakPolicy);
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(values.autoCloseGraceMinutes >= 0);
  const errors = state?.fieldErrors ?? {};

  useEffect(() => {
    if (state?.saved) {
      toast.success(
        branchName
          ? `Policy override for ${branchName} saved`
          : "Global attendance policy saved"
      );
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, branchName]);

  return (
    <form action={formAction} className="w-full space-y-8" noValidate>
      <input type="hidden" name="branchId" value={branchId ?? ""} />
      {/*
        The most important thing on this page. A placeholder nobody revisits
        quietly becomes company policy, and that is worse than a hard-coded
        value because it looks deliberate.
      */}
      {values.isProvisional && (
        <Alert>
          <TriangleAlert className="size-4" />
          <AlertTitle>These values have not been confirmed</AlertTitle>
          <AlertDescription>
            They are placeholders chosen so the attendance engine could be built, not
            decisions anyone has made. Attendance is being calculated with them right now.
            Check each against your actual employment terms, then tick the box at the
            bottom.
          </AlertDescription>
        </Alert>
      )}

      {state?.saved && (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>
            A new policy version is in effect from now. Attendance already settled keeps
            the rules it was calculated under.
          </AlertDescription>
        </Alert>
      )}

      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <fieldset disabled={!canEdit || isPending} className="space-y-8">
        <section className="space-y-4">
          <div>
            <h2 className="font-heading text-lg font-bold">Arrival and departure</h2>
            <p className="text-sm text-muted-foreground">
              How much slack there is before a shift counts as started late or ended early.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              name="graceInMinutes"
              label="Late grace"
              hint="Arriving within this of the scheduled start is not recorded as late."
              defaultValue={values.graceInMinutes}
              min={0}
              max={120}
              error={errors.graceInMinutes}
            />
            <Field
              name="graceOutMinutes"
              label="Early departure grace"
              hint="Leaving within this of the scheduled end is not recorded as early."
              defaultValue={values.graceOutMinutes}
              min={0}
              max={120}
              error={errors.graceOutMinutes}
            />
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="font-heading text-lg font-bold">Overtime</h2>
            <p className="text-sm text-muted-foreground">
              The threshold gates overtime rather than being subtracted from it. Work less
              than this past a shift and none of it counts; work more and all of it does.
            </p>
          </div>
          <Field
            name="overtimeThresholdMinutes"
            label="Overtime threshold"
            hint="Restaurant closes are never punctual. Set to 0 to count every minute past the shift."
            defaultValue={values.overtimeThresholdMinutes}
            min={0}
            max={240}
            error={errors.overtimeThresholdMinutes}
          />
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="font-heading text-lg font-bold">Breaks</h2>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="breakPolicy">How breaks are handled</Label>
            <NativeSelect
              id="breakPolicy"
              name="breakPolicy"
              value={breakPolicy}
              onChange={(e) => setBreakPolicy(e.target.value as PolicyValues["breakPolicy"])}
              className="max-w-xs"
            >
              <option value="EXPLICIT_PUNCH">Staff punch in and out of breaks</option>
              <option value="AUTO_DEDUCT">Deduct a fixed break automatically</option>
            </NativeSelect>
          </div>

          {breakPolicy === "AUTO_DEDUCT" && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                name="autoDeductMinutes"
                label="Break length"
                hint="Unpaid minutes removed from a qualifying shift."
                defaultValue={values.autoDeductMinutes}
                min={0}
                max={240}
                error={errors.autoDeductMinutes}
              />
              <Field
                name="autoDeductAfterMinutes"
                label="Only on shifts longer than"
                hint="Shorter shifts have nothing deducted."
                defaultValue={values.autoDeductAfterMinutes}
                min={0}
                max={1440}
                error={errors.autoDeductAfterMinutes}
              />
            </div>
          )}

          {/* Kept in the DOM when hidden so switching policy does not silently
              reset values the form never submitted. */}
          {breakPolicy !== "AUTO_DEDUCT" && (
            <>
              <input type="hidden" name="autoDeductMinutes" value={values.autoDeductMinutes} />
              <input
                type="hidden"
                name="autoDeductAfterMinutes"
                value={values.autoDeductAfterMinutes}
              />
            </>
          )}
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="font-heading text-lg font-bold">Rounding</h2>
            <p className="text-sm text-muted-foreground">
              Off by default, and deliberately so. Rounding is a payroll decision, and
              rounding consistently downward takes a few minutes off every shift forever.
              When on, worked time is rounded to the nearest step, never down.
            </p>
          </div>
          <Field
            name="roundingMinutes"
            label="Round worked time to"
            hint="0 disables rounding entirely."
            defaultValue={values.roundingMinutes}
            min={0}
            max={30}
            error={errors.roundingMinutes}
          />
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="font-heading text-lg font-bold">Shift Auto-Closing & Exceptions</h2>
          </div>

          <div className="rounded-xl border border-border p-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="autoCloseEnabled" className="text-base font-semibold">
                  Auto-close missing clock-outs
                </Label>
                <p className="text-xs text-muted-foreground">
                  When enabled, shifts left open past their scheduled end time are automatically
                  closed with a SYSTEM_AUTO_CLOSE event, flagged with AUTO_CLOSED, and credited 0 overtime.
                </p>
              </div>
              <Switch
                id="autoCloseEnabled"
                checked={autoCloseEnabled}
                onChange={(e) => setAutoCloseEnabled(e.target.checked)}
              />
            </div>

            {autoCloseEnabled ? (
              <Field
                name="autoCloseGraceMinutes"
                label="Auto-close grace period"
                hint="How long after scheduled end before the shift is closed automatically."
                defaultValue={Math.max(0, values.autoCloseGraceMinutes)}
                min={0}
                max={720}
                error={errors.autoCloseGraceMinutes}
              />
            ) : (
              <input type="hidden" name="autoCloseGraceMinutes" value="-1" />
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              name="dedupWindowMinutes"
              label="Duplicate window"
              hint="Punches this close together from different sources are treated as the same action."
              defaultValue={values.dedupWindowMinutes}
              min={1}
              max={60}
              error={errors.dedupWindowMinutes}
            />
            <Field
              name="maxManualEntryDays"
              label="Manual entry limit"
              hint="How far back a manager may record attendance by hand. This is the least-verified path in the system, so shorter is safer."
              defaultValue={values.maxManualEntryDays}
              min={0}
              max={90}
              suffix="days"
              error={errors.maxManualEntryDays}
            />
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="font-heading text-lg font-bold">Overtime Authorization Authority</h2>
            <p className="text-sm text-muted-foreground">
              By default, only Area Managers and Administrators have authority to approve payable overtime.
              You can grant this authority to Branch Managers as well.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border p-4">
            <div>
              <Label htmlFor="branchManagerCanAuthorizeOvertime" className="font-semibold">
                Allow Branch Managers to authorize payable overtime
              </Label>
              <p className="text-xs text-muted-foreground">
                When enabled, branch managers can sign off on payable overtime minutes for employees assigned to their branch.
              </p>
            </div>
            <input
              type="checkbox"
              id="branchManagerCanAuthorizeOvertime"
              name="branchManagerCanAuthorizeOvertime"
              defaultChecked={values.branchManagerCanAuthorizeOvertime}
              className="size-4 rounded border-input"
            />
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="changeReason">Why are you changing this?</Label>
            {/*
              Keyed on the saved version so a successful save remounts an empty
              box. Leaving the previous reason behind invites the next change to
              inherit an explanation written about a different one — and a wrong
              reason in the history is worse than none.
            */}
            <Textarea
              key={state?.versionId ?? "unsaved"}
              id="changeReason"
              name="changeReason"
              rows={3}
              maxLength={500}
              defaultValue=""
              placeholder="e.g. Overtime threshold raised to 30 minutes following the March review of closing times."
              aria-describedby="changeReason-hint"
              aria-invalid={errors.changeReason ? true : undefined}
            />
            <p id="changeReason-hint" className="text-xs text-muted-foreground">
              Recorded against this version permanently. These are employment terms, so
              knowing who changed them is rarely enough: someone will ask why.
            </p>
            {errors.changeReason && (
              <p className="text-xs text-destructive">{errors.changeReason}</p>
            )}
          </div>

          <div className="flex items-start gap-3 border-t border-border pt-3">
            <Switch id="confirmed" name="confirmed" defaultChecked={!values.isProvisional} />
            <div className="space-y-1">
              <Label htmlFor="confirmed" className="font-medium">
                These values match our employment terms
              </Label>
              <p className="text-xs text-muted-foreground">
                Ticking this removes the &ldquo;not confirmed&rdquo; warning. Leave it clear
                if you are still checking. The values still apply either way.
              </p>
            </div>
          </div>
        </section>

        {canEdit && (
          <Button type="submit" disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save new version
          </Button>
        )}
      </fieldset>

      {!canEdit && (
        <Alert>
          <AlertDescription>
            You can view this policy but not change it. Grace periods and overtime
            thresholds are employment terms, so only HR can alter them.
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}
