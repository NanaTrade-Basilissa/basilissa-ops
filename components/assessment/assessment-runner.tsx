"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Send } from "lucide-react";
import type { AssessmentQuestionKind } from "@prisma/client";
import type { AnswerState, SubmitState } from "@/lib/modules/assessments/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Question = {
  id: string;
  kind: AssessmentQuestionKind;
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

/**
 * Answers are saved as they are chosen, not gathered up for one submit.
 *
 * This is taken on a phone, often on a slow connection. One lost request
 * should cost one answer, not the whole attempt — and somebody who loses
 * signal halfway through can come back to the same link and carry on.
 */
export function AssessmentRunner({
  sections,
  declaredName,
  saveAction,
  submitAction,
}: {
  sections: Section[];
  declaredName: string;
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

  const allQuestions = sections.flatMap((s) => s.questions);
  const unanswered = new Set(submitState?.unanswered ?? []);

  async function persist(question: Question, next: { options: string[]; text: string }) {
    setSaving((s) => ({ ...s, [question.id]: "saving" }));

    const formData = new FormData();
    formData.set("questionId", question.id);
    for (const id of next.options) formData.append("optionId", id);
    if (question.kind === "FREE_TEXT") formData.set("text", next.text);

    const result = await saveAction(undefined, formData);
    setSaving((s) => ({
      ...s,
      [question.id]: result?.savedQuestionId ? "saved" : "failed",
    }));
  }

  function choose(question: Question, optionId: string) {
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
    const next = { ...(answers[question.id] ?? { options: [], text: "" }), text };
    setAnswers((a) => ({ ...a, [question.id]: next }));
  }

  const answeredCount = allQuestions.filter((q) => {
    const answer = answers[q.id];
    return q.kind === "FREE_TEXT"
      ? (answer?.text ?? "").trim().length > 0
      : (answer?.options.length ?? 0) > 0;
  }).length;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Answering as <span className="font-medium text-foreground">{declaredName}</span> ·{" "}
        {answeredCount} of {allQuestions.length} answered
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
                  className={missing ? "rounded-lg border border-destructive/40 p-3" : undefined}
                >
                  <legend className="mb-2 text-sm font-medium">
                    {qIndex + 1}. {question.text}
                    {!question.required && (
                      <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
                    )}
                  </legend>

                  {question.kind === "MULTI_CHOICE" && (
                    <p className="mb-2 text-xs text-muted-foreground">Choose all that apply.</p>
                  )}

                  {question.kind === "FREE_TEXT" ? (
                    <Textarea
                      rows={4}
                      value={answer.text}
                      onChange={(e) => write(question, e.target.value)}
                      // Saved when focus leaves, rather than per keystroke: a
                      // request per character would be unusable on mobile data.
                      onBlur={() => void persist(question, answer)}
                      aria-label={question.text}
                    />
                  ) : (
                    <div className="space-y-2">
                      {question.options.map((option) => {
                        const checked = answer.options.includes(option.id);
                        return (
                          <Label
                            key={option.id}
                            className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 text-sm font-normal has-checked:border-primary has-checked:bg-primary/5"
                          >
                            <input
                              type={question.kind === "MULTI_CHOICE" ? "checkbox" : "radio"}
                              name={question.id}
                              value={option.id}
                              checked={checked}
                              onChange={() => choose(question, option.id)}
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
                      <span className="text-destructive">
                        Not saved. Check your connection and try again.
                      </span>
                    )}
                    {missing && !status && (
                      <span className="text-destructive">This one still needs an answer.</span>
                    )}
                  </p>
                </fieldset>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {submitState?.error && (
        <Alert variant="destructive">
          <AlertDescription>{submitState.error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        className="w-full"
        disabled={isSubmitting}
        onClick={() =>
          startSubmit(async () => {
            setSubmitState(await submitAction(undefined));
          })
        }
      >
        {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        Finish and submit
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Your answers are saved as you go. Submitting closes the assessment and the link stops
        working.
      </p>
    </div>
  );
}
