"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, Loader2, Send, Timer } from "lucide-react";
import type { AptitudeQuestionKind } from "@prisma/client";
import type { AnswerState, SubmitState } from "@/lib/modules/aptitude/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Question = {
  id: string;
  kind: AptitudeQuestionKind;
  text: string;
  required: boolean;
  options: { id: string; text: string }[];
  selectedOptionIds: string[];
  text_answer: string | null;
};

type Section = {
  id: string;
  title: string;
  description: string | null;
  questions: Question[];
};

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Counts down from `deadlineAt` — an absolute server timestamp, never a
 * client-computed one. Every tick recomputes `deadline - Date.now()` fresh,
 * so there is nothing to drift: a wrong local clock changes what the
 * candidate SEES, never what the server enforces (`saveAnswer` and the
 * worker sweep both check the same `deadlineAt` independently of this).
 */
function CountdownBar({ deadlineAt, onExpire }: { deadlineAt: string; onExpire: () => void }) {
  const deadlineMs = useMemo(() => new Date(deadlineAt).getTime(), [deadlineAt]);
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const remainingMs = deadlineMs - now;

  useEffect(() => {
    if (remainingMs <= 0 && !firedRef.current) {
      firedRef.current = true;
      onExpire();
    }
  }, [remainingMs, onExpire]);

  // Warning tone in the last 5 minutes, or the last 20% of however much time
  // was left when this first rendered — whichever is smaller. Approximate on
  // purpose: nothing here needs to know the test's original minute count.
  const warningThresholdMs = useMemo(() => Math.min(5 * 60_000, remainingMs > 0 ? remainingMs * 0.2 + 60_000 : 5 * 60_000), []); // eslint-disable-line react-hooks/exhaustive-deps
  const low = remainingMs > 0 && remainingMs <= warningThresholdMs;
  const done = remainingMs <= 0;

  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm backdrop-blur",
        done
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : low
            ? "border-amber-400/50 bg-amber-50 text-amber-800"
            : "border-border bg-background/95 text-foreground",
      )}
    >
      <Timer className="size-4 shrink-0" />
      {done ? "Time's up — submitting your answers…" : <>Time remaining: {formatRemaining(remainingMs)}</>}
    </div>
  );
}

/**
 * Answers are saved as they are chosen — see Assessments' `AssessmentRunner`
 * for the reasoning, unchanged here. The one addition is the countdown: a
 * pure display, wired to auto-fire the same final submit the "Finish and
 * submit" button uses once it reaches zero. The server has already stopped
 * accepting new answers by then (`saveAnswer` checks the same deadline
 * independently) — this is what tells the candidate that happened, and
 * finalises whatever they got to.
 */
export function AptitudeRunner({
  sections,
  declaredName,
  deadlineAt,
  saveAction,
  submitAction,
}: {
  sections: Section[];
  declaredName: string;
  deadlineAt: string | null;
  saveAction: (prev: AnswerState, formData: FormData) => Promise<AnswerState>;
  submitAction: (prev: SubmitState) => Promise<SubmitState>;
}) {
  const [answers, setAnswers] = useState<Record<string, { options: string[]; text: string }>>(() =>
    Object.fromEntries(
      sections.flatMap((section) =>
        section.questions.map((question) => [
          question.id,
          { options: question.selectedOptionIds, text: question.text_answer ?? "" },
        ]),
      ),
    ),
  );
  const [saving, setSaving] = useState<Record<string, "saving" | "saved" | "failed">>({});
  const [submitState, setSubmitState] = useState<SubmitState>(undefined);
  const [isSubmitting, startSubmit] = useTransition();
  const [timeUp, setTimeUp] = useState(false);

  const allQuestions = sections.flatMap((s) => s.questions);
  const unanswered = new Set(submitState?.unanswered ?? []);
  const locked = timeUp || isSubmitting;

  function doSubmit() {
    startSubmit(async () => {
      setSubmitState(await submitAction(undefined));
    });
  }

  async function persist(question: Question, next: { options: string[]; text: string }) {
    setSaving((s) => ({ ...s, [question.id]: "saving" }));

    const formData = new FormData();
    formData.set("questionId", question.id);
    for (const id of next.options) formData.append("optionId", id);
    if (question.kind === "FREE_TEXT") formData.set("text", next.text);

    const result = await saveAction(undefined, formData);
    setSaving((s) => ({ ...s, [question.id]: result?.savedQuestionId ? "saved" : "failed" }));
  }

  function choose(question: Question, optionId: string) {
    if (locked) return;
    const current = answers[question.id] ?? { options: [], text: "" };
    const options =
      question.kind === "MULTI_CHOICE"
        ? current.options.includes(optionId)
          ? current.options.filter((id) => id !== optionId)
          : [...current.options, optionId]
        : [optionId];

    const next = { ...current, options };
    setAnswers((a) => ({ ...a, [question.id]: next }));
    void persist(question, next);
  }

  function write(question: Question, text: string) {
    if (locked) return;
    const next = { ...(answers[question.id] ?? { options: [], text: "" }), text };
    setAnswers((a) => ({ ...a, [question.id]: next }));
  }

  const answeredCount = allQuestions.filter((q) => {
    const answer = answers[q.id];
    return q.kind === "FREE_TEXT" ? (answer?.text ?? "").trim().length > 0 : (answer?.options.length ?? 0) > 0;
  }).length;

  return (
    <div className="space-y-6">
      {deadlineAt && (
        <CountdownBar
          deadlineAt={deadlineAt}
          onExpire={() => {
            setTimeUp(true);
            doSubmit();
          }}
        />
      )}

      <p className="text-sm text-muted-foreground">
        Answering as <span className="font-medium text-foreground">{declaredName}</span> · {answeredCount} of{" "}
        {allQuestions.length} answered
      </p>

      {sections.map((section, index) => (
        <Card key={section.id}>
          <CardHeader>
            <CardTitle className="text-lg">
              <span className="text-muted-foreground">Section {index + 1} · </span>
              {section.title}
            </CardTitle>
            {section.description && <CardDescription>{section.description}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-8">
            {section.questions.map((question, qIndex) => {
              const answer = answers[question.id] ?? { options: [], text: "" };
              const status = saving[question.id];
              const missing = unanswered.has(question.id);

              return (
                <fieldset
                  key={question.id}
                  disabled={locked}
                  className={missing ? "rounded-lg border border-destructive/40 p-3" : undefined}
                >
                  <legend className="mb-2 text-sm font-medium">
                    {qIndex + 1}. {question.text}
                    {!question.required && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
                  </legend>

                  {question.kind === "MULTI_CHOICE" && (
                    <p className="mb-2 text-xs text-muted-foreground">Choose all that apply.</p>
                  )}

                  {question.kind === "FREE_TEXT" ? (
                    <Textarea
                      rows={4}
                      value={answer.text}
                      onChange={(e) => write(question, e.target.value)}
                      onBlur={() => !locked && void persist(question, answer)}
                      aria-label={question.text}
                      disabled={locked}
                    />
                  ) : (
                    <div className="space-y-2">
                      {question.options.map((option) => {
                        const checked = answer.options.includes(option.id);
                        return (
                          <Label
                            key={option.id}
                            className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 text-sm font-normal has-checked:border-primary has-checked:bg-primary/5 has-disabled:cursor-not-allowed has-disabled:opacity-60"
                          >
                            <input
                              type={question.kind === "MULTI_CHOICE" ? "checkbox" : "radio"}
                              name={question.id}
                              value={option.id}
                              checked={checked}
                              onChange={() => choose(question, option.id)}
                              disabled={locked}
                              className="mt-0.5 size-4 accent-primary"
                            />
                            <span>{option.text}</span>
                          </Label>
                        );
                      })}
                    </div>
                  )}

                  <p className="mt-1.5 h-4 text-xs text-muted-foreground">
                    {status === "saving" && "Saving…"}
                    {status === "saved" && (
                      <span className="inline-flex items-center gap-1">
                        <Check className="size-3" /> Saved
                      </span>
                    )}
                    {status === "failed" && (
                      <span className="text-destructive">Not saved. Check your connection and try again.</span>
                    )}
                    {missing && !status && <span className="text-destructive">This one still needs an answer.</span>}
                  </p>
                </fieldset>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {submitState?.error && !timeUp && (
        <Alert variant="destructive">
          <AlertDescription>{submitState.error}</AlertDescription>
        </Alert>
      )}

      <Button type="button" className="w-full" disabled={locked} onClick={doSubmit}>
        {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        Finish and submit
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        {deadlineAt
          ? "Your answers are saved as you go. Submitting, or running out of time, closes the test and the link stops working."
          : "Your answers are saved as you go. Submitting closes the test and the link stops working."}
      </p>
    </div>
  );
}
