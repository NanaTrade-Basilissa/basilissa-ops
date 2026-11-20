"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, MessageSquareText, Save, Star } from "lucide-react";
import type { QuestionFormState } from "@/lib/modules/questions/actions";
import { DEFAULT_RATING_LABELS, type FeedbackQuestionKind } from "@/lib/modules/feedback/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export function QuestionForm({
  action,
  defaultValues,
  submitLabel,
  activeCount,
  activeCap,
  onSuccess,
}: {
  action: (prevState: QuestionFormState, formData: FormData) => Promise<QuestionFormState>;
  defaultValues?: {
    text: string;
    type?: FeedbackQuestionKind;
    isRequired?: boolean;
    isActive: boolean;
    ratingLabels?: string[];
  };
  submitLabel: string;
  /** Count of *other* active questions (excludes the one being edited, if any). */
  activeCount: number;
  activeCap: number;
  onSuccess?: () => void;
}) {
  const [state, formAction, isPending] = useActionState<QuestionFormState, FormData>(action, undefined);
  const [questionType, setQuestionType] = useState<FeedbackQuestionKind>(defaultValues?.type ?? "RATING");
  const atCap = activeCount >= activeCap;
  const wasActive = defaultValues?.isActive ?? false;
  const wasRequired = defaultValues?.isRequired ?? (questionType === "RATING");
  const ratingLabels = defaultValues?.ratingLabels ?? DEFAULT_RATING_LABELS;

  useEffect(() => {
    if (state?.success) onSuccess?.();
  }, [state, onSuccess]);

  return (
    <form action={formAction} className="max-w-lg space-y-5" noValidate>
      <input type="hidden" name="type" value={questionType} />

      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label>Question type</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setQuestionType("RATING")}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-colors cursor-pointer",
              questionType === "RATING"
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted/50",
            )}
          >
            <Star className="size-4 shrink-0 text-amber-500" />
            <div>
              <div className="font-semibold text-foreground">Rating (1–5)</div>
              <div className="text-[11px] text-muted-foreground">Counts toward score</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setQuestionType("TEXT")}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-colors cursor-pointer",
              questionType === "TEXT"
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted/50",
            )}
          >
            <MessageSquareText className="size-4 shrink-0 text-blue-500" />
            <div>
              <div className="font-semibold text-foreground">Open-Ended</div>
              <div className="text-[11px] text-muted-foreground">Free text, no score impact</div>
            </div>
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="text">Question</Label>
        <Input
          id="text"
          name="text"
          required
          defaultValue={defaultValues?.text}
          placeholder={
            questionType === "TEXT"
              ? "What could we do to make your next visit even better?"
              : "How would you rate the quality of the food?"
          }
        />
        {state?.fieldErrors?.text && <p className="text-xs text-destructive">{state.fieldErrors.text}</p>}
      </div>

      {questionType === "RATING" ? (
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
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-border/80 bg-muted/30 p-3">
          <Switch
            id="isRequired"
            name="isRequired"
            defaultChecked={defaultValues?.type === "TEXT" ? wasRequired : false}
          />
          <div>
            <Label htmlFor="isRequired" className="mb-0">
              Require an answer
            </Label>
            <p className="text-xs text-muted-foreground">
              Leave off to let customers skip this open-ended question if they have nothing to add.
            </p>
          </div>
        </div>
      )}

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
