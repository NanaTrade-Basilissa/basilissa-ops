"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import type { AptitudeFormState } from "@/lib/modules/aptitude/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
}) {
  const [state, formAction, isPending] = useActionState<AptitudeFormState, FormData>(action, undefined);
  const errors = state?.fieldErrors ?? {};
  const [invitationsExpire, setInvitationsExpire] = useState(values?.invitationsExpire ?? true);
  const [timed, setTimed] = useState((values?.timeLimitMinutes ?? null) !== null);

  return (
    <form action={formAction} className="space-y-4" noValidate>
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

      <SettingsGroup title="General">
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required defaultValue={values?.title} placeholder="Numerical reasoning" />
          {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">
            Introduction <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={values?.description ?? ""}
            aria-describedby="description-hint"
          />
          <p id="description-hint" className="text-xs text-muted-foreground">
            Shown at the top of the test, before the first question.
          </p>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Scoring">
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
        <SettingsGroup title="Timing" description="A single countdown for the whole test, not per question.">
          <div className="flex items-start gap-3">
            <Switch
              id="timed"
              checked={timed}
              onChange={(e) => setTimed(e.target.checked)}
            />
            <div className="space-y-1">
              <Label htmlFor="timed" className="font-medium">
                This test is timed
              </Label>
              <p className="text-xs text-muted-foreground">
                Off means candidates can take as long as they like. On starts the clock the
                moment they open the link — it keeps running even if they close the tab.
              </p>
            </div>
          </div>
          {timed && (
            <div className="space-y-1.5 pl-[calc(1rem+0.75rem)]">
              <Label htmlFor="timeLimitMinutes">Minutes</Label>
              <Input
                id="timeLimitMinutes"
                name="timeLimitMinutes"
                type="number"
                min={5}
                max={480}
                inputMode="numeric"
                defaultValue={values.timeLimitMinutes ?? 30}
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
  );
}
