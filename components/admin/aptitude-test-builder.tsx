"use client";

import { useActionState, useEffect, useState } from "react";
import { AlignLeft, Check, CheckSquare, Circle, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
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

const KIND_ICON: Record<AptitudeQuestionKind, typeof Circle> = {
  SINGLE_CHOICE: Circle,
  MULTI_CHOICE: CheckSquare,
  FREE_TEXT: AlignLeft,
};

type Section = {
  id: string;
  title: string;
  description: string | null;
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
  editable,
  sections,
  addSectionAction,
  updateSectionAction,
  addQuestionAction,
  deleteQuestionAction,
}: {
  testId: string;
  editable: boolean;
  sections: Section[];
  addSectionAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  updateSectionAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  addQuestionAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  deleteQuestionAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
}) {
  const [sectionState, addSection, addingSection] = useActionState<AptitudeFormState, FormData>(
    addSectionAction,
    undefined,
  );
  const [openFor, setOpenFor] = useState<string | null>(null);

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

        return (
          <div key={section.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-start justify-between gap-2 border-b border-border bg-muted/40 px-5 py-3">
              <div>
                <h3 className="font-heading font-semibold text-foreground">
                  <span className="text-muted-foreground">Section {index + 1} · </span>
                  {section.title}
                </h3>
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
              {editable && <EditSectionButton section={section} action={updateSectionAction} />}
            </div>

            <div className="space-y-3 p-4">
              {section.questions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No questions in this section yet.</p>
              ) : (
                <ol className="space-y-3">
                  {section.questions.map((question, qIndex) => {
                    const KindIcon = KIND_ICON[question.kind];
                    const questionNumber = offset + qIndex + 1;
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
                        {editable && <DeleteQuestionButton questionId={question.id} action={deleteQuestionAction} />}
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
                    onClick={() => setOpenFor(section.id)}
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
        <form action={addSection} className="space-y-3 rounded-xl border border-dashed border-border p-4">
          {sectionState?.error && (
            <Alert variant="destructive">
              <AlertDescription>{sectionState.error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sectionTitle">New section title</Label>
              <Input id="sectionTitle" name="title" required placeholder="Numerical reasoning" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sectionDescription">
                Description <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input id="sectionDescription" name="description" />
            </div>
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={addingSection}>
            {addingSection ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add section
          </Button>
        </form>
      )}
    </div>
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
  action,
}: {
  section: { id: string; title: string; description: string | null };
  action: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<AptitudeFormState, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result?.saved) setOpen(false);
      return result;
    },
    undefined,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Edit section" />}>
        <Pencil className="size-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit section</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="sectionId" value={section.id} />
          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`edit-title-${section.id}`}>Title</Label>
            <Input id={`edit-title-${section.id}`} name="title" required defaultValue={section.title} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-description-${section.id}`}>
              Description <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id={`edit-description-${section.id}`}
              name="description"
              defaultValue={section.description ?? ""}
            />
          </div>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save changes
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuestionForm({
  sectionId,
  action,
  onDone,
}: {
  sectionId: string;
  action: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  onDone: () => void;
}) {
  const [state, formAction, isPending] = useActionState<AptitudeFormState, FormData>(action, undefined);
  const [kind, setKind] = useState<AptitudeQuestionKind>("SINGLE_CHOICE");
  const [optionCount, setOptionCount] = useState(3);

  useEffect(() => {
    if (state?.saved) onDone();
  }, [state?.saved, onDone]);

  if (state?.saved) return null;

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-lg border border-border border-l-4 border-l-primary bg-background p-4 shadow-sm"
    >
      <input type="hidden" name="sectionId" value={sectionId} />

      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>
            {state.error}
            {state.fieldErrors?.options && <> {state.fieldErrors.options}</>}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`text-${sectionId}`}>Question</Label>
        <Textarea id={`text-${sectionId}`} name="text" rows={2} required />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`kind-${sectionId}`}>Type</Label>
          <NativeSelect
            id={`kind-${sectionId}`}
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as AptitudeQuestionKind)}
          >
            {Object.entries(QUESTION_KIND_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>

        {kind !== "FREE_TEXT" && (
          <div className="space-y-1.5">
            <Label htmlFor={`points-${sectionId}`}>Points</Label>
            <Input id={`points-${sectionId}`} name="points" type="number" min={0} max={100} defaultValue={1} />
          </div>
        )}

        <div className="flex items-end gap-2 pb-2">
          <Switch id={`required-${sectionId}`} name="required" defaultChecked />
          <Label htmlFor={`required-${sectionId}`} className="font-normal">
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
          {Array.from({ length: optionCount }, (_, index) => (
            <div key={index} className="flex items-center gap-2.5 rounded-md border border-transparent px-1 py-0.5 hover:border-border">
              {kind === "MULTI_CHOICE" ? (
                <CheckSquare className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground" />
              )}
              <Input
                name="optionText"
                placeholder={`Option ${index + 1}`}
                className="border-0 border-b border-border rounded-none px-0 shadow-none focus-visible:ring-0 focus-visible:border-primary"
              />
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  name="optionCorrect"
                  value={index}
                  aria-label={`Option ${index + 1} is correct`}
                  className="size-4 accent-primary"
                />
                correct
              </label>
            </div>
          ))}
          {optionCount < MAX_OPTIONS_PER_QUESTION && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setOptionCount((n) => n + 1)}>
              <Plus className="size-4" /> Another option
            </Button>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add question
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          <Trash2 className="size-4" /> Cancel
        </Button>
      </div>
    </form>
  );
}
