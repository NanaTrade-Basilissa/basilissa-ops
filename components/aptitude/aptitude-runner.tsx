"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowRight, Check, Loader2, Send, Timer } from "lucide-react";
import type { AptitudeQuestionKind } from "@prisma/client";
import type { AnswerState, SubmitState, AdvanceSectionState } from "@/lib/modules/aptitude/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  timeLimitMinutes: number | null;
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

  const warningThresholdMs = useMemo(
    () => Math.min(5 * 60_000, remainingMs > 0 ? remainingMs * 0.2 + 60_000 : 5 * 60_000),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
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
 * WhatsApp / Instagram Story Style Segmented Progress Bar:
 * - Equal horizontal segments corresponding to each section.
 * - Completed sections are 100% filled.
 * - Current active section fills dynamically from 0% to 100% as section time elapses.
 * - Upcoming sections are empty.
 * - Shows current section title, answered count, and countdown clock.
 */
function SectionStoryProgressBar({
  sections,
  currentSectionIndex,
  sectionDeadlineAt,
  onSectionExpire,
  answeredCount,
  totalQuestions,
}: {
  sections: Section[];
  currentSectionIndex: number;
  sectionDeadlineAt: string | null;
  onSectionExpire: () => void;
  answeredCount: number;
  totalQuestions: number;
}) {
  const currentSection = sections[currentSectionIndex];
  const limitMinutes = currentSection?.timeLimitMinutes ?? 0;
  const deadlineMs = useMemo(
    () => (sectionDeadlineAt ? new Date(sectionDeadlineAt).getTime() : null),
    [sectionDeadlineAt],
  );

  const [now, setNow] = useState(() => Date.now());
  const expiredRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;
  }, [currentSectionIndex, sectionDeadlineAt]);

  useEffect(() => {
    if (!deadlineMs) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [deadlineMs]);

  const remainingMs = deadlineMs ? Math.max(0, deadlineMs - now) : null;
  const totalDurationMs = limitMinutes > 0 ? limitMinutes * 60_000 : 0;
  const elapsedMs = totalDurationMs > 0 && remainingMs !== null ? Math.max(0, totalDurationMs - remainingMs) : 0;
  const activeProgress =
    totalDurationMs > 0 ? Math.min(100, Math.max(0, (elapsedMs / totalDurationMs) * 100)) : 0;

  useEffect(() => {
    if (remainingMs !== null && remainingMs <= 0 && !expiredRef.current) {
      expiredRef.current = true;
      onSectionExpire();
    }
  }, [remainingMs, onSectionExpire]);

  const isLow = remainingMs !== null && remainingMs <= 60_000 && remainingMs > 0;
  const isExpired = remainingMs !== null && remainingMs <= 0;

  return (
    <div className="sticky top-0 z-20 space-y-2.5 rounded-xl border border-border/80 bg-background/95 p-3.5 shadow-xs backdrop-blur">
      {/* Segmented status bars */}
      <div className="flex items-center gap-1.5 w-full">
        {sections.map((section, idx) => {
          const isCompleted = idx < currentSectionIndex;
          const isActive = idx === currentSectionIndex;
          const progress = isCompleted ? 100 : isActive ? activeProgress : 0;

          return (
            <div
              key={section.id}
              className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted dark:bg-muted/60"
              title={`Section ${idx + 1}: ${section.title}${section.timeLimitMinutes ? ` (${section.timeLimitMinutes} mins)` : ""}`}
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-200 ease-linear",
                  isCompleted
                    ? "bg-primary w-full"
                    : isActive
                      ? isLow || isExpired
                        ? "bg-amber-500"
                        : "bg-primary"
                      : "w-0",
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* Header labels: section title and live timer */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="font-semibold text-foreground">
            Section {currentSectionIndex + 1} of {sections.length}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="font-medium text-foreground truncate max-w-[200px] sm:max-w-xs">
            {currentSection?.title}
          </span>
          <span className="text-muted-foreground hidden sm:inline">
            ({answeredCount} of {totalQuestions} answered)
          </span>
        </div>

        {remainingMs !== null ? (
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-xs font-semibold shrink-0",
              isExpired
                ? "bg-destructive/15 text-destructive animate-pulse"
                : isLow
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 animate-pulse"
                  : "bg-secondary text-foreground",
            )}
          >
            <Timer className="size-3.5 shrink-0" />
            {isExpired ? "Time's up!" : `${formatRemaining(remainingMs)} remaining`}
          </div>
        ) : (
          <span className="text-muted-foreground">Untimed section</span>
        )}
      </div>
    </div>
  );
}

function useTabAbsenceTracking(recordAbsence: (leftAt: string, durationMs: number) => void) {
  const recordAbsenceRef = useRef(recordAbsence);
  useEffect(() => {
    recordAbsenceRef.current = recordAbsence;
  }, [recordAbsence]);

  useEffect(() => {
    let hiddenAt: number | null = null;

    function handleVisibilityChange() {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt !== null) {
        const leftAtIso = new Date(hiddenAt).toISOString();
        const durationMs = Date.now() - hiddenAt;
        hiddenAt = null;
        recordAbsenceRef.current(leftAtIso, durationMs);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);
}

function blockClipboardEvent(e: React.ClipboardEvent | React.MouseEvent) {
  e.preventDefault();
}

export function AptitudeRunner({
  sections,
  declaredName,
  deadlineAt,
  isSectionTimed = false,
  initialSectionIndex = 0,
  initialSectionDeadlineAt = null,
  saveAction,
  advanceSectionAction,
  submitAction,
  recordAbsenceAction,
}: {
  sections: Section[];
  declaredName: string;
  deadlineAt: string | null;
  isSectionTimed?: boolean;
  initialSectionIndex?: number;
  initialSectionDeadlineAt?: string | null;
  saveAction: (prev: AnswerState, formData: FormData) => Promise<AnswerState>;
  advanceSectionAction?: () => Promise<AdvanceSectionState>;
  submitAction: (prev: SubmitState) => Promise<SubmitState>;
  recordAbsenceAction: (leftAt: string, durationMs: number) => Promise<void>;
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

  // Section timing state
  const [currentSectionIndex, setCurrentSectionIndex] = useState(initialSectionIndex);
  const [sectionDeadlineAt, setSectionDeadlineAt] = useState<string | null>(initialSectionDeadlineAt);
  const [isAdvancing, startAdvance] = useTransition();
  const [showConfirmNext, setShowConfirmNext] = useState(false);

  useTabAbsenceTracking((leftAt, durationMs) => void recordAbsenceAction(leftAt, durationMs));

  const allQuestions = sections.flatMap((s) => s.questions);
  const unanswered = new Set(submitState?.unanswered ?? []);
  const locked = timeUp || isSubmitting || isAdvancing;

  function doSubmit() {
    startSubmit(async () => {
      setSubmitState(await submitAction(undefined));
    });
  }

  function doAdvance() {
    if (!advanceSectionAction) return;
    startAdvance(async () => {
      const outcome = await advanceSectionAction();
      if (outcome.ok) {
        if (!outcome.submitted && typeof outcome.nextIndex === "number") {
          setCurrentSectionIndex(outcome.nextIndex);
          setSectionDeadlineAt(outcome.sectionDeadlineAt ?? null);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      } else if (outcome.error) {
        setSubmitState({ error: outcome.error });
      }
    });
  }

  function handleSectionExpire() {
    if (currentSectionIndex < sections.length - 1) {
      doAdvance();
    } else {
      setTimeUp(true);
      doSubmit();
    }
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

  const currentSection = sections[currentSectionIndex];
  const questionsInCurrent = currentSection?.questions ?? [];
  const answeredInCurrent = questionsInCurrent.filter((q) => {
    const answer = answers[q.id];
    return q.kind === "FREE_TEXT" ? (answer?.text ?? "").trim().length > 0 : (answer?.options.length ?? 0) > 0;
  }).length;
  const unansweredInCurrent = questionsInCurrent.length - answeredInCurrent;

  function handleNextClick() {
    if (unansweredInCurrent > 0) {
      setShowConfirmNext(true);
    } else {
      doAdvance();
    }
  }

  // Which sections to render: in section-timed mode, render only current section
  const visibleSections = isSectionTimed
    ? currentSection
      ? [{ section: currentSection, originalIndex: currentSectionIndex }]
      : []
    : sections.map((section, idx) => ({ section, originalIndex: idx }));

  return (
    <div
      className="space-y-6 select-none"
      onCopy={blockClipboardEvent}
      onCut={blockClipboardEvent}
      onPaste={blockClipboardEvent}
      onContextMenu={blockClipboardEvent}
    >
      {isSectionTimed ? (
        <SectionStoryProgressBar
          sections={sections}
          currentSectionIndex={currentSectionIndex}
          sectionDeadlineAt={sectionDeadlineAt}
          onSectionExpire={handleSectionExpire}
          answeredCount={answeredInCurrent}
          totalQuestions={questionsInCurrent.length}
        />
      ) : (
        deadlineAt && (
          <CountdownBar
            deadlineAt={deadlineAt}
            onExpire={() => {
              setTimeUp(true);
              doSubmit();
            }}
          />
        )
      )}

      <p className="text-sm text-muted-foreground">
        Answering as <span className="font-medium text-foreground">{declaredName}</span> · {answeredCount} of{" "}
        {allQuestions.length} total answered
      </p>

      {visibleSections.map(({ section, originalIndex }) => {
        const offset = sections.slice(0, originalIndex).reduce((sum, s) => sum + s.questions.length, 0);

        return (
          <Card key={section.id}>
            <CardHeader>
              <CardTitle className="text-lg">
                <span className="text-muted-foreground">Section {originalIndex + 1} · </span>
                {section.title}
              </CardTitle>
              {section.description && (
                <CardDescription className="whitespace-pre-wrap text-sm">
                  {section.description.includes("|") ? (
                    <span className="mt-2 block overflow-x-auto rounded-md border border-border/50 bg-muted/50 p-3 font-mono text-xs sm:text-sm text-foreground">
                      {section.description}
                    </span>
                  ) : (
                    section.description
                  )}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-8">
              {section.questions.map((question, qIndex) => {
                const answer = answers[question.id] ?? { options: [], text: "" };
                const status = saving[question.id];
                const missing = unanswered.has(question.id);
                const questionNumber = offset + qIndex + 1;

                return (
                  <fieldset
                    key={question.id}
                    disabled={locked}
                    className={missing ? "rounded-lg border border-destructive/40 p-3" : undefined}
                  >
                    <legend className="mb-2 text-sm font-medium whitespace-pre-line">
                      {questionNumber}. {question.text}
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
        );
      })}

      {submitState?.error && !timeUp && (
        <Alert variant="destructive">
          <AlertDescription>{submitState.error}</AlertDescription>
        </Alert>
      )}

      {isSectionTimed && currentSectionIndex < sections.length - 1 ? (
        <div className="space-y-2">
          <Button
            type="button"
            className="w-full"
            disabled={locked}
            onClick={handleNextClick}
          >
            {isAdvancing ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            Next section ({currentSectionIndex + 2} of {sections.length})
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Once you proceed to the next section, this section will be locked and its answers finalised.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Button type="button" className="w-full" disabled={locked} onClick={doSubmit}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Finish and submit
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {deadlineAt || isSectionTimed
              ? "Your answers are saved as you go. Submitting, or running out of time, closes the test and the link stops working."
              : "Your answers are saved as you go. Submitting closes the test and the link stops working."}
          </p>
        </div>
      )}

      {/* Confirmation dialog when clicking Next with unanswered questions */}
      <Dialog open={showConfirmNext} onOpenChange={setShowConfirmNext}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Proceed to next section?</DialogTitle>
            <DialogDescription>
              You have {unansweredInCurrent} unanswered question{unansweredInCurrent === 1 ? "" : "s"} in this
              section. Once you proceed, you cannot return to this section.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setShowConfirmNext(false)}>
              Keep answering
            </Button>
            <Button
              type="button"
              onClick={() => {
                setShowConfirmNext(false);
                doAdvance();
              }}
            >
              Proceed to next section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
