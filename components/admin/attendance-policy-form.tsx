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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsRow } from "@/components/admin/settings-row";
import { Separator } from "@/components/ui/separator";

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
            Placeholders, not real decisions...attendance is being calculated with them
            now. Check each, then confirm below.
          </AlertDescription>
        </Alert>
      )}

      {state?.saved && (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>
            In effect from now. Already-settled attendance keeps its old rules.
          </AlertDescription>
        </Alert>
      )}

      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <fieldset disabled={!canEdit || isPending} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Arrival and departure</CardTitle>
            <CardDescription>Slack allowed before a shift counts as late or early.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                name="graceInMinutes"
                label="Late grace"
                hint="Within this of the scheduled start isn't late."
                defaultValue={values.graceInMinutes}
                min={0}
                max={120}
                error={errors.graceInMinutes}
              />
              <Field
                name="graceOutMinutes"
                label="Early departure grace"
                hint="Within this of the scheduled end isn't early."
                defaultValue={values.graceOutMinutes}
                min={0}
                max={120}
                error={errors.graceOutMinutes}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Overtime</CardTitle>
            <CardDescription>
              Gates overtime rather than subtracting from it. Under counts as none, over
              counts as all.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field
              name="overtimeThresholdMinutes"
              label="Overtime threshold"
              hint="0 counts every minute past the shift."
              defaultValue={values.overtimeThresholdMinutes}
              min={0}
              max={240}
              error={errors.overtimeThresholdMinutes}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Breaks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rounding</CardTitle>
            <CardDescription>
              Off by default, rounding down quietly shaves minutes off every shift. When
              on, it only rounds up.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field
              name="roundingMinutes"
              label="Round worked time to"
              hint="0 disables rounding entirely."
              defaultValue={values.roundingMinutes}
              min={0}
              max={30}
              error={errors.roundingMinutes}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Auto-closing & exceptions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="divide-y divide-border">
              <SettingsRow
                htmlFor="autoCloseEnabled"
                label="Auto-close missing clock-outs"
                description="Closes shifts left open past their scheduled end, flags them AUTO_CLOSED, and credits 0 overtime."
                control={
                  <Switch
                    id="autoCloseEnabled"
                    checked={autoCloseEnabled}
                    onChange={(e) => setAutoCloseEnabled(e.target.checked)}
                  />
                }
              />
            </div>

            {autoCloseEnabled ? (
              <div className="">
                <Field
                  name="autoCloseGraceMinutes"
                  label="Auto-close grace period"
                  hint=""
                  defaultValue={Math.max(0, values.autoCloseGraceMinutes)}
                  min={0}
                  max={720}
                  error={errors.autoCloseGraceMinutes}
                />
              </div>
            ) : (
              <input type="hidden" name="autoCloseGraceMinutes" value="-1" />
            )}

            <Separator />

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                name="dedupWindowMinutes"
                label="Duplicate window"
                hint="Punches this close together count as one."
                defaultValue={values.dedupWindowMinutes}
                min={1}
                max={60}
                error={errors.dedupWindowMinutes}
              />
              <Field
                name="maxManualEntryDays"
                label="Manual entry limit"
                hint="How far back a manager can record attendance by hand."
                defaultValue={values.maxManualEntryDays}
                min={0}
                max={90}
                suffix="days"
                error={errors.maxManualEntryDays}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Overtime authorization</CardTitle>
            <CardDescription>
              Only Area Managers and Administrators can approve overtime by default.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              <SettingsRow
                htmlFor="branchManagerCanAuthorizeOvertime"
                label="Allow Branch Managers to authorize payable overtime"
                description="Lets branch managers approve overtime for their own branch."
                control={
                  <Switch
                    id="branchManagerCanAuthorizeOvertime"
                    name="branchManagerCanAuthorizeOvertime"
                    defaultChecked={values.branchManagerCanAuthorizeOvertime}
                  />
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="changeReason">Why are you changing this?</Label>
              {/*
                Keyed on the saved version so a successful save remounts an empty
                box. Leaving the previous reason behind invites the next change to
                inherit an explanation written about a different one and a wrong
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
              {errors.changeReason && (
                <p className="text-xs text-destructive">{errors.changeReason}</p>
              )}
            </div>

            <div className="flex items-start gap-3 border-t border-border pt-4">
              <Switch id="confirmed" name="confirmed" defaultChecked={!values.isProvisional} />
              <div className="space-y-1">
                <Label htmlFor="confirmed" className="font-medium">
                  These values match our employment terms
                </Label>
                <p className="text-xs text-muted-foreground">
                  Removes the &ldquo;not confirmed&rdquo; warning. Values apply either way.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

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
            View only — grace periods and overtime are employment terms only HR can change.
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}
