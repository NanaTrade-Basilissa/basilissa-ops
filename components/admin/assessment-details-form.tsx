"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import type { AssessmentFormState } from "@/lib/modules/assessments/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function AssessmentDetailsForm({
  action,
  submitLabel,
  values,
}: {
  action: (prev: AssessmentFormState, formData: FormData) => Promise<AssessmentFormState>;
  submitLabel: string;
  values?: {
    title: string;
    description: string | null;
    showScoreToTaker: boolean;
    passMarkPercent: number | null;
  };
}) {
  const [state, formAction, isPending] = useActionState<AssessmentFormState, FormData>(
    action,
    undefined,
  );
  const errors = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
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

      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          required
          defaultValue={values?.title}
          placeholder="Food safety refresher"
        />
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
          Shown at the top of the assessment, before the first question.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
        <Switch
          id="showScoreToTaker"
          name="showScoreToTaker"
          defaultChecked={values?.showScoreToTaker ?? false}
        />
        <div className="space-y-1">
          <Label htmlFor="showScoreToTaker" className="font-medium">
            Show the score to the person taking it
          </Label>
          {/*
            Off by default and worth explaining, because the reflex is to turn
            it on.
          */}
          <p className="text-xs text-muted-foreground">
            Off by default. A visible score turns a diagnostic into an exam. People compare
            results, and the honest answers you wanted stop arriving. Leave it off unless the
            score itself is the point.
          </p>
        </div>
      </div>

      {/*
        Not offered on the create form (`values` is only passed when editing):
        a threshold is meaningless before the points it is a threshold OF
        exist, and there are none until questions are added.
      */}
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
          {errors.passMarkPercent && (
            <p className="text-xs text-destructive">{errors.passMarkPercent}</p>
          )}
          <p id="passMarkPercent-hint" className="text-xs text-muted-foreground">
            Percent of points needed to pass. Leave blank if this is a diagnostic rather than a
            test: nothing will be marked pass or fail. Shown to the taker only alongside the
            score, so it stays hidden whenever the score does.
          </p>
        </div>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        {submitLabel}
      </Button>
    </form>
  );
}
