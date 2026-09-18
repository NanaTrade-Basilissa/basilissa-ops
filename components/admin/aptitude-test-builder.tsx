"use client";

import { useActionState, useRef, useState } from "react";
import { AlignLeft, Check, CheckSquare, Circle, Loader2, Pencil, Plus, Save, Timer, X } from "lucide-react";
import type { AptitudeQuestionKind } from "@prisma/client";
import type { AptitudeFormState } from "@/lib/modules/aptitude/actions";
import { QUESTION_KIND_LABEL, MAX_OPTIONS_PER_QUESTION } from "@/lib/modules/aptitude/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const KIND_ICON: Record<AptitudeQuestionKind, typeof Circle> = {
  SINGLE_CHOICE: Circle,
  MULTI_CHOICE: CheckSquare,
  FREE_TEXT: AlignLeft,
};

type Section = {
  id: string;
  title: string;
  description: string | null;
  timeLimitMinutes: number | null;
  questions: {
    id: string;
    kind: AptitudeQuestionKind;
    text: string;
    points: number;
    required: boolean;
    options: { id: string; text: string; isCorrect: boolean }[];
  }[];
};

export function AptitudeTestBuilder({
  testTimeLimitMinutes,
  editable,
  sections,
  addSectionAction,
  updateSectionAction,
  addQuestionAction,
  updateQuestionAction,
  deleteQuestionAction,
}: {
  testId: string;
  testTimeLimitMinutes?: number | null;
  editable: boolean;
  sections: Section[];
  addSectionAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  updateSectionAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  addQuestionAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  updateQuestionAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  deleteQuestionAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
}) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const totalSectionMinutes = sections.reduce((sum, s) => sum + (s.timeLimitMinutes ?? 0), 0);

  return (
    <div className="space-y-6">
      {sections.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No sections yet. A section groups related questions: &ldquo;Numerical&rdquo;,
          &ldquo;Verbal reasoning&rdquo;.
        </p>
      )}

      {sections.map((section, index) => {
        const offset = sections.slice(0, index).reduce((sum, s) => sum + s.questions.length, 0);
        const otherSectionsTotal = sections
          .filter((s) => s.id !== section.id)
          .reduce((sum, s) => sum + (s.timeLimitMinutes ?? 0), 0);

        return (
          <div key={section.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-start justify-between gap-2 border-b border-border bg-muted/40 px-5 py-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-heading font-semibold text-foreground">
                    <span className="text-muted-foreground">Section {index + 1} · </span>
                    {section.title}
                  </h3>
                  {section.timeLimitMinutes ? (
                    <Badge variant="secondary" className="gap-1 text-xs font-normal">
                      <Timer className="size-3" />
                      {section.timeLimitMinutes} {section.timeLimitMinutes === 1 ? "min" : "mins"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                      Untimed
                    </Badge>
                  )}
                </div>
                {section.description && (
                  <div className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                    {section.description.includes("|") ? (
                      <div className="font-mono text-xs rounded bg-muted/50 p-2.5 border border-border/50 overflow-x-auto mt-1 text-foreground">
                        {section.description}
                      </div>
                    ) : (
                      section.description
                    )}
                  </div>
                )}
              </div>
              {editable && (
                <EditSectionButton
                  section={section}
                  otherSectionsTotal={otherSectionsTotal}
                  testTimeLimitMinutes={testTimeLimitMinutes}
                  action={updateSectionAction}
                />
              )}
            </div>

            <div className="space-y-3 p-4">
              {section.questions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No questions in this section yet.</p>
              ) : (
                <ol className="space-y-3">
                  {section.questions.map((question, qIndex) => {
                    const KindIcon = KIND_ICON[question.kind];
                    const questionNumber = offset + qIndex + 1;

                    if (editingQuestionId === question.id) {
                      return (
                        <li key={question.id}>
                          <QuestionForm
                            sectionId={section.id}
                            questionId={question.id}
                            initialData={question}
                            action={updateQuestionAction}
                            onDone={() => setEditingQuestionId(null)}
                          />
                        </li>
                      );
                    }

                    return (
                      <li key={question.id} className="rounded-lg border border-border bg-background p-4 text-sm shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="font-medium text-foreground whitespace-pre-line">
                              {questionNumber}. {question.text}
                            </span>
                            <Badge variant="secondary" className="gap-1 text-xs font-normal">
                              <KindIcon className="size-3" />
                              {QUESTION_KIND_LABEL[question.kind]}
                            </Badge>
                            {question.kind !== "FREE_TEXT" && (
                              <span className="text-xs text-muted-foreground">
                                {question.points} {question.points === 1 ? "point" : "points"}
                              </span>
                            )}
                            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                              {question.required ? "required" : "optional"}
                            </Badge>
                          </div>
                          {editable && (
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => {
                                  setOpenFor(null);
                                  setEditingQuestionId(question.id);
                                }}
                                aria-label="Edit question"
                                title="Edit question"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <DeleteQuestionButton questionId={question.id} action={deleteQuestionAction} />
                            </div>
                          )}
                        </div>

                        {question.options.length > 0 && (
                          <ul className="mt-3 space-y-1.5">
                            {question.options.map((option) => {
                              const OptionIcon = question.kind === "MULTI_CHOICE" ? CheckSquare : Circle;
                              return (
                                <li key={option.id} className="flex items-center gap-2 text-muted-foreground">
                                  <OptionIcon
                                    className={
                                      option.isCorrect
                                        ? "size-3.5 shrink-0 text-primary"
                                        : "size-3.5 shrink-0 text-muted-foreground/50"
                                    }
                                  />
                                  <span className={option.isCorrect ? "font-medium text-foreground" : undefined}>
                                    {option.text}
                                  </span>
                                  {option.isCorrect && <Check className="size-3.5 shrink-0 text-primary" />}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}

              {editable && (
                <>
                  {openFor === section.id ? (
                    <QuestionForm sectionId={section.id} action={addQuestionAction} onDone={() => setOpenFor(null)} />
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-dashed"
                      onClick={() => {
                        setEditingQuestionId(null);
                        setOpenFor(section.id);
                      }}
                    >
                      <Plus className="size-4" /> Add a question
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}

      {editable && (
        <AddSectionForm
          action={addSectionAction}
          existingSectionsTotal={totalSectionMinutes}
          testTimeLimitMinutes={testTimeLimitMinutes}
        />
      )}
    </div>
  );
}

function AddSectionForm({
  action,
  existingSectionsTotal,
  testTimeLimitMinutes,
}: {
  action: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  existingSectionsTotal: number;
  testTimeLimitMinutes?: number | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const isOverridingRef = useRef(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [timeLimitMinutes, setTimeLimitMinutes] = useState("");
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [pendingNewTotal, setPendingNewTotal] = useState(0);
  const [overrideOverallTime, setOverrideOverallTime] = useState(false);

  const [state, formAction, isPending] = useActionState<AptitudeFormState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result?.saved) {
        setTitle("");
        setDescription("");
        setTimeLimitMinutes("");
        setOverrideOverallTime(false);
        setShowOverrideDialog(false);
      }
      return result;
    },
    undefined,
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (isOverridingRef.current) {
      isOverridingRef.current = false;
      return;
    }
    const trimmed = timeLimitMinutes.trim();
    if (trimmed) {
      const mins = parseInt(trimmed, 10);
      if (!isNaN(mins) && mins > 0) {
        const newTotal = existingSectionsTotal + mins;
        if (testTimeLimitMinutes != null && testTimeLimitMinutes > 0 && newTotal > testTimeLimitMinutes) {
          e.preventDefault();
          setPendingNewTotal(newTotal);
          setShowOverrideDialog(true);
          return;
        }
      }
    }
  };

  const handleConfirmOverride = () => {
    setShowOverrideDialog(false);
    setOverrideOverallTime(true);
    isOverridingRef.current = true;
    requestAnimationFrame(() => {
      formRef.current?.requestSubmit();
    });
  };

  return (
    <>
      <form
        ref={formRef}
        action={formAction}
        onSubmit={handleSubmit}
        className="space-y-3 rounded-xl border border-dashed border-border p-4"
      >
        <input type="hidden" name="overrideOverallTime" value={overrideOverallTime ? "true" : "false"} />
        {state?.error && (
          <Alert variant="destructive">
            <AlertDescription>
              {state.error}
              {state.fieldErrors?.title && <div>{state.fieldErrors.title}</div>}
              {state.fieldErrors?.timeLimitMinutes && <div>{state.fieldErrors.timeLimitMinutes}</div>}
            </AlertDescription>
          </Alert>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="sectionTitle">New section title</Label>
            <Input
              id="sectionTitle"
              name="title"
              required
              placeholder="Numerical reasoning"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sectionDescription">
              Description <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="sectionDescription"
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sectionTimeLimit">
              Time limit <span className="text-muted-foreground">(minutes, optional)</span>
            </Label>
            <Input
              id="sectionTimeLimit"
              name="timeLimitMinutes"
              type="number"
              min={1}
              max={180}
              placeholder="e.g. 10 (optional)"
              value={timeLimitMinutes}
              onChange={(e) => setTimeLimitMinutes(e.target.value)}
            />
          </div>
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add section
        </Button>
      </form>

      <AlertDialog open={showOverrideDialog} onOpenChange={setShowOverrideDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Section timer exceeds overall test timer</AlertDialogTitle>
            <AlertDialogDescription>
              The combined duration of all sections will be <strong>{pendingNewTotal} minutes</strong>, which exceeds
              the overall test timer (<strong>{testTimeLimitMinutes} minutes</strong>).
              <br />
              <br />
              Would you like to update the overall test timer to <strong>{pendingNewTotal} minutes</strong> to match?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowOverrideDialog(false);
                setOverrideOverallTime(false);
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirmOverride}>
              Update test timer & save
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DeleteQuestionButton({
  questionId,
  action,
}: {
  questionId: string;
  action: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
}) {
  const [state, formAction, isPending] = useActionState<AptitudeFormState, FormData>(action, undefined);

  return (
    <form action={formAction} className="shrink-0">
      <input type="hidden" name="questionId" value={questionId} />
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        disabled={isPending}
        aria-label="Delete question"
        title={state?.error ?? "Delete question"}
      >
        {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
      </Button>
    </form>
  );
}

function EditSectionButton({
  section,
  otherSectionsTotal,
  testTimeLimitMinutes,
  action,
}: {
  section: { id: string; title: string; description: string | null; timeLimitMinutes: number | null };
  otherSectionsTotal: number;
  testTimeLimitMinutes?: number | null;
  action: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const isOverridingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(
    section.timeLimitMinutes != null ? String(section.timeLimitMinutes) : "",
  );
  const [description, setDescription] = useState(section.description ?? "");
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [pendingNewTotal, setPendingNewTotal] = useState(0);
  const [overrideOverallTime, setOverrideOverallTime] = useState(false);

  const [state, formAction, isPending] = useActionState<AptitudeFormState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result?.saved) {
        setOpen(false);
        setOverrideOverallTime(false);
        setShowOverrideDialog(false);
      }
      return result;
    },
    undefined,
  );

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setTitle(section.title);
      setTimeLimitMinutes(section.timeLimitMinutes != null ? String(section.timeLimitMinutes) : "");
      setDescription(section.description ?? "");
      setOverrideOverallTime(false);
      setShowOverrideDialog(false);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (isOverridingRef.current) {
      isOverridingRef.current = false;
      return;
    }
    const trimmed = timeLimitMinutes.trim();
    if (trimmed) {
      const mins = parseInt(trimmed, 10);
      if (!isNaN(mins) && mins > 0) {
        const newTotal = otherSectionsTotal + mins;
        if (testTimeLimitMinutes != null && testTimeLimitMinutes > 0 && newTotal > testTimeLimitMinutes) {
          e.preventDefault();
          setPendingNewTotal(newTotal);
          setShowOverrideDialog(true);
          return;
        }
      }
    }
  };

  const handleConfirmOverride = () => {
    setShowOverrideDialog(false);
    setOverrideOverallTime(true);
    isOverridingRef.current = true;
    requestAnimationFrame(() => {
      formRef.current?.requestSubmit();
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Edit section" />}>
          <Pencil className="size-3.5" />
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit section</DialogTitle>
          </DialogHeader>
          <form ref={formRef} action={formAction} onSubmit={handleSubmit} className="space-y-4">
            <input type="hidden" name="sectionId" value={section.id} />
            <input type="hidden" name="overrideOverallTime" value={overrideOverallTime ? "true" : "false"} />
            {state?.error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {state.error}
                  {state.fieldErrors?.title && <div>{state.fieldErrors.title}</div>}
                  {state.fieldErrors?.timeLimitMinutes && <div>{state.fieldErrors.timeLimitMinutes}</div>}
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label htmlFor={`edit-title-${section.id}`}>Title</Label>
              <Input
                id={`edit-title-${section.id}`}
                name="title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`edit-timelimit-${section.id}`}>
                Time limit <span className="text-muted-foreground">(minutes, optional)</span>
              </Label>
              <Input
                id={`edit-timelimit-${section.id}`}
                name="timeLimitMinutes"
                type="number"
                min={1}
                max={180}
                value={timeLimitMinutes}
                onChange={(e) => setTimeLimitMinutes(e.target.value)}
                placeholder="Leave blank for untimed"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`edit-description-${section.id}`}>
                Description <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id={`edit-description-${section.id}`}
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save changes
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showOverrideDialog} onOpenChange={setShowOverrideDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Section timer exceeds overall test timer</AlertDialogTitle>
            <AlertDialogDescription>
              The combined duration of all sections will be <strong>{pendingNewTotal} minutes</strong>, which exceeds
              the overall test timer (<strong>{testTimeLimitMinutes} minutes</strong>).
              <br />
              <br />
              Would you like to update the overall test timer to <strong>{pendingNewTotal} minutes</strong> to match?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowOverrideDialog(false);
                setOverrideOverallTime(false);
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirmOverride}>
              Update test timer & save
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function QuestionForm({
  sectionId,
  questionId,
  initialData,
  action,
  onDone,
}: {
  sectionId: string;
  questionId?: string;
  initialData?: {
    id: string;
    kind: AptitudeQuestionKind;
    text: string;
    points: number;
    required: boolean;
    options: { id: string; text: string; isCorrect: boolean }[];
  };
  action: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  onDone: () => void;
}) {
  const [state, formAction, isPending] = useActionState<AptitudeFormState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result?.saved) {
        onDone();
      }
      return result;
    },
    undefined,
  );
  const [kind, setKind] = useState<AptitudeQuestionKind>(initialData?.kind ?? "SINGLE_CHOICE");
  const [text, setText] = useState(initialData?.text ?? "");
  const [points, setPoints] = useState(initialData?.points ?? 1);
  const [required, setRequired] = useState(initialData?.required ?? true);
  const [options, setOptions] = useState<Array<{ id: string; text: string; isCorrect: boolean }>>(
    initialData?.options && initialData.options.length > 0
      ? initialData.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect }))
      : [
          { id: "opt-1", text: "", isCorrect: false },
          { id: "opt-2", text: "", isCorrect: false },
          { id: "opt-3", text: "", isCorrect: false },
        ]
  );
  const [clientError, setClientError] = useState<string | null>(null);

  if (state?.saved) return null;

  const updateOptionText = (index: number, val: string) => {
    setClientError(null);
    setOptions((prev) =>
      prev.map((opt, i) => (i === index ? { ...opt, text: val } : opt))
    );
  };

  const toggleOptionCorrect = (index: number) => {
    setClientError(null);
    setOptions((prev) =>
      prev.map((opt, i) => {
        if (kind === "SINGLE_CHOICE") {
          return { ...opt, isCorrect: i === index };
        }
        return i === index ? { ...opt, isCorrect: !opt.isCorrect } : opt;
      })
    );
  };

  const handleKindChange = (newKind: AptitudeQuestionKind) => {
    setKind(newKind);
    setClientError(null);
    if (newKind === "SINGLE_CHOICE") {
      let foundFirst = false;
      setOptions((prev) =>
        prev.map((opt) => {
          if (opt.isCorrect && !foundFirst) {
            foundFirst = true;
            return opt;
          }
          return { ...opt, isCorrect: false };
        })
      );
    }
  };

  const addOption = () => {
    if (options.length >= MAX_OPTIONS_PER_QUESTION) return;
    setClientError(null);
    setOptions((prev) => [
      ...prev,
      { id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text: "", isCorrect: false },
    ]);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return;
    setClientError(null);
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!text.trim()) {
      e.preventDefault();
      setClientError("Please enter the question text.");
      return;
    }
    if (text.trim().length < 3) {
      e.preventDefault();
      setClientError("Question text must be at least 3 characters long.");
      return;
    }
    if (kind !== "FREE_TEXT") {
      const nonEmptyOptions = options.filter((o) => o.text.trim().length > 0);
      if (nonEmptyOptions.length < 2) {
        e.preventDefault();
        setClientError("Give at least 2 options for this question.");
        return;
      }
      const correctCount = nonEmptyOptions.filter((o) => o.isCorrect).length;
      if (correctCount === 0) {
        e.preventDefault();
        setClientError("Mark at least one option as correct.");
        return;
      }
      if (kind === "SINGLE_CHOICE" && correctCount > 1) {
        e.preventDefault();
        setClientError("Only one option can be marked as correct for single-choice questions.");
        return;
      }
    }
    setClientError(null);
  };

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-border border-l-4 border-l-primary bg-background p-4 shadow-sm"
    >
      <input type="hidden" name="sectionId" value={sectionId} />
      {questionId && <input type="hidden" name="questionId" value={questionId} />}

      {(clientError || state?.error) && (
        <Alert variant="destructive">
          <AlertDescription className="space-y-1">
            <div>{clientError || state?.error}</div>
            {state?.fieldErrors && (
              <ul className="list-inside list-disc text-xs opacity-90">
                {Object.entries(state.fieldErrors).map(([key, msg]) => (
                  <li key={key}>{msg}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`text-${sectionId}`}>Question</Label>
        <Textarea
          id={`text-${sectionId}`}
          name="text"
          rows={2}
          required
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setClientError(null);
          }}
          placeholder="e.g. What is the next number in the sequence: 2, 4, 8, 16, ...?"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`kind-${sectionId}`}>Type</Label>
          <NativeSelect
            id={`kind-${sectionId}`}
            name="kind"
            value={kind}
            onChange={(e) => handleKindChange(e.target.value as AptitudeQuestionKind)}
          >
            {Object.entries(QUESTION_KIND_LABEL).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>

        {kind !== "FREE_TEXT" ? (
          <div className="space-y-1.5">
            <Label htmlFor={`points-${sectionId}`}>Points</Label>
            <Input
              id={`points-${sectionId}`}
              name="points"
              type="number"
              min={0}
              max={100}
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
            />
          </div>
        ) : (
          <input type="hidden" name="points" value={0} />
        )}

        <div className="flex items-end gap-2 pb-2">
          <Switch
            id={`required-${sectionId}`}
            name="required"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          <Label htmlFor={`required-${sectionId}`} className="font-normal cursor-pointer select-none">
            Must be answered
          </Label>
        </div>
      </div>

      {kind === "FREE_TEXT" ? (
        <p className="text-xs text-muted-foreground">
          Written answers are not scored. They are recorded for you to read, and left out of the
          total so nobody&rsquo;s score is out of a number they could not reach.
        </p>
      ) : (
        <div className="space-y-2">
          <Label>
            Options{" "}
            <span className="font-normal text-muted-foreground">
              (tick the {kind === "MULTI_CHOICE" ? "correct ones" : "correct one"})
            </span>
          </Label>
          {options.map((option, index) => {
            const OptionIcon = kind === "MULTI_CHOICE" ? CheckSquare : Circle;
            return (
              <div
                key={option.id}
                className="flex items-center gap-2.5 rounded-md border border-transparent px-1 py-0.5 hover:border-border"
              >
                <OptionIcon className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  name="optionText"
                  value={option.text}
                  onChange={(e) => updateOptionText(index, e.target.value)}
                  placeholder={`Option ${index + 1}`}
                  className="border-0 border-b border-border rounded-none px-0 shadow-none focus-visible:ring-0 focus-visible:border-primary"
                />
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type={kind === "SINGLE_CHOICE" ? "radio" : "checkbox"}
                    name="optionCorrect"
                    value={index}
                    checked={option.isCorrect}
                    onChange={() => toggleOptionCorrect(index)}
                    aria-label={`Option ${index + 1} is correct`}
                    className="size-4 accent-primary cursor-pointer"
                  />
                  correct
                </label>
                {options.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeOption(index)}
                    aria-label={`Remove option ${index + 1}`}
                  >
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
          {options.length < MAX_OPTIONS_PER_QUESTION && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addOption}
            >
              <Plus className="size-4" /> Another option
            </Button>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : questionId ? (
            <Save className="size-4" />
          ) : (
            <Plus className="size-4" />
          )}
          {questionId ? "Save changes" : "Add question"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
