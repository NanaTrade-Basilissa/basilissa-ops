"use client";

import { useActionState, useRef, useState } from "react";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import type { AptitudeFormState } from "@/lib/modules/aptitude/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** A labeled group of fields, styled like a card, without its own `<form>` — this whole page is one submission. */
function SettingsGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-4">
        <h3 className="font-heading text-sm font-semibold text-foreground">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function AptitudeTestDetailsForm({
  action,
  submitLabel,
  values,
  totalSectionMinutes = 0,
}: {
  action: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  submitLabel: string;
  values?: {
    title: string;
    description: string | null;
    showScoreToCandidate: boolean;
    passMarkPercent: number | null;
    invitationsExpire: boolean;
    invitationTtlHours: number;
    timeLimitMinutes: number | null;
  };
  totalSectionMinutes?: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const isOverridingRef = useRef(false);
  const [state, formAction, isPending] = useActionState<AptitudeFormState, FormData>(action, undefined);
  const errors = state?.fieldErrors ?? {};
  const [invitationsExpire, setInvitationsExpire] = useState(values?.invitationsExpire ?? true);
  const [timed, setTimed] = useState((values?.timeLimitMinutes ?? null) !== null);
  const [timeLimitMinutesVal, setTimeLimitMinutesVal] = useState(
    values?.timeLimitMinutes != null ? String(values.timeLimitMinutes) : "30",
  );
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [pendingMinutes, setPendingMinutes] = useState<number | null>(null);
  const [clearSectionTimers, setClearSectionTimers] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (isOverridingRef.current) {
      isOverridingRef.current = false;
      return;
    }
    if (values && totalSectionMinutes > 0) {
      const minutesVal = timed ? parseInt(timeLimitMinutesVal || "0", 10) : 0;
      if (!timed || isNaN(minutesVal) || minutesVal < totalSectionMinutes) {
        e.preventDefault();
        setPendingMinutes(timed && !isNaN(minutesVal) && minutesVal > 0 ? minutesVal : null);
        setShowOverrideDialog(true);
        return;
      }
    }
  };

  const handleConfirmOverride = () => {
    setShowOverrideDialog(false);
    setClearSectionTimers(true);
    isOverridingRef.current = true;
    requestAnimationFrame(() => {
      formRef.current?.requestSubmit();
    });
  };

  return (
    <>
      <form ref={formRef} action={formAction} onSubmit={handleSubmit} className="space-y-4" noValidate>
        <input type="hidden" name="clearSectionTimers" value={clearSectionTimers ? "true" : "false"} />
        {state?.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        {state?.saved && (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertDescription>Saved.</AlertDescription>
          </Alert>
        )}

        <SettingsGroup title="General" description="Basic information seen by candidates and administrators.">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              required
              defaultValue={values?.title}
              placeholder="e.g. General Aptitude Assessment"
              aria-describedby="title-hint"
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">
              Instructions <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={values?.description ?? ""}
              placeholder="e.g. Read each question carefully. You may not pause the test once started."
              aria-describedby="description-hint"
            />
            {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
            <p id="description-hint" className="text-xs text-muted-foreground">
              Shown to the candidate on their identity verification / start screen before the test
              begins.
            </p>
          </div>
        </SettingsGroup>

        <SettingsGroup title="Scoring" description="How results are presented to candidates.">
          <div className="flex items-start gap-3">
            <Switch
              id="showScoreToCandidate"
              name="showScoreToCandidate"
              defaultChecked={values?.showScoreToCandidate ?? false}
            />
            <div className="space-y-1">
              <Label htmlFor="showScoreToCandidate" className="font-medium">
                Show the score to the candidate
              </Label>
              <p className="text-xs text-muted-foreground">
                Off by default. HR sees the score either way — this only controls whether the
                candidate does too on their thank-you screen.
              </p>
            </div>
          </div>

          {values && (
            <div className="space-y-1.5">
              <Label htmlFor="passMarkPercent">
                Pass mark <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="passMarkPercent"
                name="passMarkPercent"
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                defaultValue={values.passMarkPercent ?? ""}
                placeholder="No pass mark"
                className="max-w-[10rem]"
                aria-describedby="passMarkPercent-hint"
              />
              {errors.passMarkPercent && <p className="text-xs text-destructive">{errors.passMarkPercent}</p>}
              <p id="passMarkPercent-hint" className="text-xs text-muted-foreground">
                Percent of points needed to pass. Leave blank if this is a diagnostic rather than a
                pass/fail screen.
              </p>
            </div>
          )}
        </SettingsGroup>

        {values && (
          <SettingsGroup
            title="Timing"
            description="A single countdown for the whole test, or configure individual section timers in Questions."
          >
            <div className="flex items-start gap-3">
              <Switch
                id="timed"
                checked={timed}
                onChange={(e) => setTimed(e.target.checked)}
              />
              <div className="space-y-1">
                <Label htmlFor="timed" className="font-medium">
                  Overall test timer
                </Label>
                <p className="text-xs text-muted-foreground">
                  Off means candidates can take as long as they like (unless individual sections have their own
                  time limits set in the Questions tab). On sets a single countdown for the whole test.
                </p>
              </div>
            </div>
            {timed && (
              <div className="space-y-1.5 pl-[calc(1rem+0.75rem)]">
                <Label htmlFor="timeLimitMinutes">Total test minutes</Label>
                <Input
                  id="timeLimitMinutes"
                  name="timeLimitMinutes"
                  type="number"
                  min={1}
                  max={480}
                  inputMode="numeric"
                  value={timeLimitMinutesVal}
                  onChange={(e) => setTimeLimitMinutesVal(e.target.value)}
                  className="max-w-[10rem]"
                  aria-describedby="timeLimitMinutes-hint"
                />
                {errors.timeLimitMinutes && <p className="text-xs text-destructive">{errors.timeLimitMinutes}</p>}
                <p id="timeLimitMinutes-hint" className="text-xs text-muted-foreground">
                  Applies to attempts that start from now on — someone already partway through
                  keeps the deadline they were given when they opened the link.
                </p>
              </div>
            )}
            {!timed && <input type="hidden" name="timeLimitMinutes" value="" />}
            <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
              💡 <strong>Section timing:</strong> To time individual sections (e.g. Section 1 = 5m, Section 2 = 10m),
              set the minutes when creating or editing each section under the <strong>Questions</strong> tab.
              Candidates will take the test section-by-section with live progress bars and auto-advance.
            </div>
          </SettingsGroup>
        )}

        {values && (
          <SettingsGroup title="Access" description="Controls how long an issued link stays usable.">
            <div className="flex items-start gap-3">
              <Switch
                id="invitationsExpire"
                name="invitationsExpire"
                checked={invitationsExpire}
                onChange={(e) => setInvitationsExpire(e.target.checked)}
              />
              <div className="space-y-1">
                <Label htmlFor="invitationsExpire" className="font-medium">
                  Links expire on their own
                </Label>
                <p className="text-xs text-muted-foreground">
                  Off means an issued link only stops working once the candidate submits it (or
                  you withdraw it). It never times out on a clock — separate from the test timer
                  above, which only starts once they actually open it.
                </p>
              </div>
            </div>
            {invitationsExpire && (
              <div className="space-y-1.5 pl-[calc(1rem+0.75rem)]">
                <Label htmlFor="invitationTtlHours">Expires after (hours)</Label>
                <Input
                  id="invitationTtlHours"
                  name="invitationTtlHours"
                  type="number"
                  min={1}
                  max={24 * 365}
                  inputMode="numeric"
                  defaultValue={values.invitationTtlHours}
                  className="max-w-[10rem]"
                  aria-describedby="invitationTtlHours-hint"
                />
                {errors.invitationTtlHours && <p className="text-xs text-destructive">{errors.invitationTtlHours}</p>}
                <p id="invitationTtlHours-hint" className="text-xs text-muted-foreground">
                  168 is a week. Applies to links issued from now on.
                </p>
              </div>
            )}
          </SettingsGroup>
        )}

        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {submitLabel}
        </Button>
      </form>

      <AlertDialog open={showOverrideDialog} onOpenChange={setShowOverrideDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Override individual section timers?</AlertDialogTitle>
            <AlertDialogDescription>
              Your test currently has individual section timers totaling <strong>{totalSectionMinutes} minutes</strong>.
              <br />
              <br />
              Setting the overall test timer to <strong>{pendingMinutes ? `${pendingMinutes} minutes` : "untimed"}</strong> will
              clear all section timers so the entire test runs on the overall timer.
              <br />
              <br />
              Would you like to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowOverrideDialog(false);
                setClearSectionTimers(false);
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirmOverride}>
              Override & clear section timers
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
