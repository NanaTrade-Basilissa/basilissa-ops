"use client";

import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";
import type { QuestionFormState } from "@/lib/modules/questions/actions";
import { DEFAULT_RATING_LABELS } from "@/lib/modules/feedback/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function QuestionForm({
  action,
  defaultValues,
  submitLabel,
  activeCount,
  activeCap,
}: {
  action: (prevState: QuestionFormState, formData: FormData) => Promise<QuestionFormState>;
  defaultValues?: { text: string; isActive: boolean; ratingLabels?: string[] };
  submitLabel: string;
  /** Count of *other* active questions (excludes the one being edited, if any). */
  activeCount: number;
  activeCap: number;
}) {
  const [state, formAction, isPending] = useActionState<QuestionFormState, FormData>(action, undefined);
  const atCap = activeCount >= activeCap;
  const wasActive = defaultValues?.isActive ?? false;
  const ratingLabels = defaultValues?.ratingLabels ?? DEFAULT_RATING_LABELS;

  return (
    <form action={formAction} className="max-w-lg space-y-5" noValidate>
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="text">Question</Label>
        <Input
          id="text"
          name="text"
          required
          defaultValue={defaultValues?.text}
          placeholder="How would you rate the quality of the food?"
        />
        {state?.fieldErrors?.text && <p className="text-xs text-destructive">{state.fieldErrors.text}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Response labels</Label>
        <p className="text-xs text-muted-foreground">
          What customers see next to each score, 1 to 5. Defaults to the standard scale. Change
          these if the question isn&apos;t a quality rating (e.g. a likelihood question).
        </p>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((score, i) => (
            <div key={score} className="flex items-center gap-2">
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground"
                aria-hidden
              >
                {score}
              </span>
              <Input
                id={`ratingLabel${score}`}
                name={`ratingLabel${score}`}
                required
                defaultValue={ratingLabels[i]}
                aria-label={`Label for score ${score}`}
              />
            </div>
          ))}
        </div>
        {state?.fieldErrors?.ratingLabels && (
          <p className="text-xs text-destructive">{state.fieldErrors.ratingLabels}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="isActive"
          name="isActive"
          defaultChecked={wasActive}
          disabled={atCap && !wasActive}
        />
        <div>
          <Label htmlFor="isActive" className="mb-0">
            Active
          </Label>
          <p className="text-xs text-muted-foreground">
            {atCap && !wasActive
              ? `Active question limit reached (${activeCount}/${activeCap}). Deactivate another question first.`
              : `Shown to customers. Capped at ${activeCap} active questions at a time (${activeCount}/${activeCap} used).`}
          </p>
        </div>
        {state?.fieldErrors?.isActive && (
          <p className="text-xs text-destructive">{state.fieldErrors.isActive}</p>
        )}
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        {submitLabel}
      </Button>
    </form>
  );
}
