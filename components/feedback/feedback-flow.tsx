"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft, Loader2, MapPin, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Logo } from "@/components/brand/logo";
import { FEEDBACK_TOKEN_STORAGE_KEY } from "@/lib/modules/feedback/constants";
import { cn } from "@/lib/utils";

type BranchOption = { id: string; name: string; slug: string; location: string };
type QuestionItem = { id: string; text: string; order: number; ratingLabels: string[] };

type Step = "welcome" | "branch" | "question" | "submitting" | "thank-you" | "submit-error";

type StoredSession = { token: string; status: "in-progress" | "submitted" };

function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(FEEDBACK_TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (parsed.token && (parsed.status === "in-progress" || parsed.status === "submitted")) {
      return parsed as StoredSession;
    }
    return null;
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredSession) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(FEEDBACK_TOKEN_STORAGE_KEY, JSON.stringify(session));
}

function clearStoredSession() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(FEEDBACK_TOKEN_STORAGE_KEY);
}

function createToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Extremely old browsers only: still shaped like a UUID for server validation.
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (
      Number(c) ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))
    ).toString(16),
  );
}

export function FeedbackFlow({
  branches,
  questions,
  preselectedBranch,
  requestedBranchInactive,
}: {
  branches: BranchOption[];
  questions: QuestionItem[];
  preselectedBranch: BranchOption | null;
  requestedBranchInactive: boolean;
}) {
  const [step, setStep] = useState<Step>("welcome");
  const [selectedBranch, setSelectedBranch] = useState<BranchOption | null>(preselectedBranch);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [token, setToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // On mount: resume an already-submitted session (refresh after success),
  // or reuse/create the idempotency token for this browser tab.
  //
  // react-hooks/set-state-in-effect is disabled deliberately. sessionStorage
  // is an external system that cannot be read during SSR, so a lazy useState
  // initializer would produce a hydration mismatch — reading it after mount
  // and gating the UI on `hydrated` is the point of this effect, not an
  // accident. Empty deps are correct: this must run exactly once per mount.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const existing = readStoredSession();
    if (existing?.status === "submitted") {
      setToken(existing.token);
      setStep("thank-you");
    } else if (existing?.status === "in-progress") {
      setToken(existing.token);
    } else {
      const next = createToken();
      writeStoredSession({ token: next, status: "in-progress" });
      setToken(next);
    }
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const totalQuestions = questions.length;
  const currentQuestion = questions[questionIndex];

  const canStartDirectly = Boolean(selectedBranch);

  function resetForNewSubmission() {
    clearStoredSession();
    const next = createToken();
    writeStoredSession({ token: next, status: "in-progress" });
    setToken(next);
    setAnswers({});
    setQuestionIndex(0);
    setErrorMessage(null);
    setStep("welcome");
  }

  function handleStart() {
    setStep(canStartDirectly ? "question" : "branch");
  }

  function handleBranchChosen(branch: BranchOption) {
    setSelectedBranch(branch);
    setStep("question");
  }

  async function submit(finalAnswers: Record<string, number>) {
    if (!selectedBranch || !token) return;
    setStep("submitting");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchSlug: selectedBranch.slug,
          submissionToken: token,
          answers: questions.map((q) => ({ questionId: q.id, score: finalAnswers[q.id] })),
        }),
      });

      if (response.status === 429) {
        setErrorMessage("Too many submissions from this device right now. Please try again shortly.");
        setStep("submit-error");
        return;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setErrorMessage(body?.error ?? "We couldn't submit your feedback. Please try again.");
        setStep("submit-error");
        return;
      }

      writeStoredSession({ token, status: "submitted" });
      setStep("thank-you");
    } catch {
      setErrorMessage("You appear to be offline. Please check your connection and try again.");
      setStep("submit-error");
    }
  }

  function handleAnswer(score: number) {
    if (!currentQuestion) return;
    const next = { ...answers, [currentQuestion.id]: score };
    setAnswers(next);

    const isLastQuestion = questionIndex === totalQuestions - 1;
    if (isLastQuestion) {
      void submit(next);
      return;
    }

    // Small delay so the selected state is visible before advancing.
    window.setTimeout(() => setQuestionIndex((i) => i + 1), 220);
  }

  function handleBack() {
    if (questionIndex === 0) {
      setStep(branches.length > 1 ? "branch" : "welcome");
      return;
    }
    setQuestionIndex((i) => i - 1);
  }

  const progressLabel = currentQuestion ? `Question ${questionIndex + 1} of ${totalQuestions}` : "";

  if (!hydrated) {
    return <FullScreenState><Loader2 className="size-6 animate-spin text-muted-foreground" /></FullScreenState>;
  }

  if (branches.length === 0) {
    return (
      <FullScreenState>
        <Alert variant="destructive" className="max-w-sm">
          <AlertTitle>No branches available</AlertTitle>
          <AlertDescription>
            We&apos;re not accepting feedback online right now. Please speak with a staff
            member at the branch instead.
          </AlertDescription>
        </Alert>
      </FullScreenState>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <header className="flex items-center justify-center border-b border-border/60 bg-background px-4 py-4">
        <Logo />
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6 sm:py-10">
        {step === "welcome" && (
          <WelcomeStep
            selectedBranch={selectedBranch}
            requestedBranchInactive={requestedBranchInactive}
            onStart={handleStart}
            onChangeBranch={() => setStep("branch")}
          />
        )}

        {step === "branch" && (
          <BranchStep branches={branches} onSelect={handleBranchChosen} />
        )}

        {step === "question" && currentQuestion && selectedBranch && (
          <QuestionStep
            branchName={selectedBranch.name}
            progressLabel={progressLabel}
            questionIndex={questionIndex}
            totalQuestions={totalQuestions}
            question={currentQuestion}
            selectedScore={answers[currentQuestion.id]}
            onAnswer={handleAnswer}
            onBack={handleBack}
          />
        )}

        {step === "submitting" && (
          <FullScreenState>
            <Loader2 className="size-8 animate-spin text-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">Sending your feedback…</p>
          </FullScreenState>
        )}

        {step === "submit-error" && (
          <SubmitErrorStep
            message={errorMessage}
            onRetry={() => void submit(answers)}
          />
        )}

        {step === "thank-you" && (
          <ThankYouStep branchName={selectedBranch?.name} onStartOver={resetForNewSubmission} />
        )}
      </main>

      <footer className="px-4 pb-6 text-center text-xs text-muted-foreground">
        Your feedback is anonymous. We never collect your name, phone number or email.
      </footer>
    </div>
  );
}

function FullScreenState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
      {children}
    </div>
  );
}

function WelcomeStep({
  selectedBranch,
  requestedBranchInactive,
  onStart,
  onChangeBranch,
}: {
  selectedBranch: BranchOption | null;
  requestedBranchInactive: boolean;
  onStart: () => void;
  onChangeBranch: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
      <div className="space-y-3">
        <p className="inline-block rounded-full bg-primary px-3 py-1 text-xs font-bold tracking-wide text-primary-foreground uppercase">
          We&apos;d love your feedback
        </p>
        <h1 className="font-heading text-3xl font-bold text-balance text-foreground sm:text-4xl">
          How was your visit to Basilissa?
        </h1>
        <p className="mx-auto max-w-xs text-sm text-muted-foreground">
          Five quick questions. Takes less than a minute, and helps us serve you better next time.
        </p>
      </div>

      {requestedBranchInactive && (
        <Alert variant="destructive" className="text-left">
          <AlertTitle>That branch link is no longer active</AlertTitle>
          <AlertDescription>Please choose your branch below instead.</AlertDescription>
        </Alert>
      )}

      {selectedBranch && (
        <Card className="w-full text-left">
          <CardContent className="flex items-center justify-between gap-3 px-4">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-foreground">
                <Store className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{selectedBranch.name}</p>
                <p className="text-xs text-muted-foreground">{selectedBranch.location}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onChangeBranch}>
              Change
            </Button>
          </CardContent>
        </Card>
      )}

      <Button size="lg" className="h-12 w-full text-base" onClick={onStart}>
        {selectedBranch ? "Start feedback" : "Choose your branch"}
      </Button>
    </div>
  );
}

function BranchStep({
  branches,
  onSelect,
}: {
  branches: BranchOption[];
  onSelect: (branch: BranchOption) => void;
}) {
  const [pendingId, setPendingId] = useState("");

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="space-y-1">
        <h2 className="font-heading text-2xl font-bold text-foreground">Which branch did you visit?</h2>
        <p className="text-sm text-muted-foreground">Select your branch to continue.</p>
      </div>

      <div className="flex flex-col gap-2">
        {branches.map((branch) => (
          <button
            key={branch.id}
            type="button"
            onClick={() => onSelect(branch)}
            className={cn(
              "flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left shadow-xs transition-colors",
              "hover:border-primary/40 hover:bg-primary/5 active:bg-primary/10",
            )}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-foreground">
              <MapPin className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">{branch.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{branch.location}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Fallback dropdown — identical data, useful once the list is long. */}
      <div className="mt-2 space-y-1.5">
        <label htmlFor="branch-fallback" className="text-xs text-muted-foreground">
          Or pick from the list
        </label>
        <NativeSelect
          id="branch-fallback"
          value={pendingId}
          onChange={(e) => {
            const branch = branches.find((b) => b.id === e.target.value);
            if (branch) onSelect(branch);
            setPendingId(e.target.value);
          }}
        >
          <option value="" disabled>
            Select a branch…
          </option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}

function QuestionStep({
  branchName,
  progressLabel,
  questionIndex,
  totalQuestions,
  question,
  selectedScore,
  onAnswer,
  onBack,
}: {
  branchName: string;
  progressLabel: string;
  questionIndex: number;
  totalQuestions: number;
  question: QuestionItem;
  selectedScore: number | undefined;
  onAnswer: (score: number) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            aria-label="Go back"
          >
            <ChevronLeft className="size-4" />
            Back
          </button>
          <span className="text-xs font-medium text-muted-foreground">{branchName}</span>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>{progressLabel}</span>
            <span>{Math.round(((questionIndex + 1) / totalQuestions) * 100)}%</span>
          </div>
          <Progress value={questionIndex + 1} max={totalQuestions} />
        </div>
      </div>

      <fieldset className="flex flex-1 flex-col gap-5">
        <legend className="font-heading text-xl leading-snug font-bold text-balance text-foreground sm:text-2xl">
          {question.text}
        </legend>

        <div className="flex flex-col gap-2.5">
          {question.ratingLabels.map((label, i) => {
            const value = i + 1;
            const checked = selectedScore === value;
            return (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3.5 shadow-xs transition-colors",
                  checked
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-primary/40 hover:bg-primary/5",
                )}
              >
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  value={value}
                  checked={checked}
                  onChange={() => onAnswer(value)}
                  className="sr-only"
                />
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    checked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {value}
                </span>
                <span className="text-sm font-medium text-foreground">{label}</span>
                {checked && <CheckCircle2 className="ml-auto size-5 text-foreground" />}
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

function SubmitErrorStep({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <Alert variant="destructive" className="text-left">
        <AlertTitle>We couldn&apos;t submit your feedback</AlertTitle>
        <AlertDescription>{message ?? "Something went wrong. Please try again."}</AlertDescription>
      </Alert>
      <Button onClick={onRetry} size="lg" className="h-12 w-full max-w-xs">
        Try again
      </Button>
    </div>
  );
}

function ThankYouStep({ branchName, onStartOver }: { branchName?: string; onStartOver: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-status-good/10 text-status-good">
        <CheckCircle2 className="size-9" />
      </span>
      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">Thank you!</h1>
        <p className="mx-auto max-w-xs text-sm text-muted-foreground">
          Your feedback{branchName ? ` for ${branchName}` : ""} has been received. We really
          appreciate you taking the time to help us improve.
        </p>
      </div>
      <Button variant="outline" onClick={onStartOver}>
        Submit another response
      </Button>
    </div>
  );
}
