import "server-only";
import { AptitudeQuestionKind, IdentityFieldMode } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { scoped } from "@/lib/platform/logger";
import { hashInvitationToken } from "./invitations";
import { finalizeAttempt } from "./finalize";
import { unansweredRequired, type ScorableQuestion } from "./scoring";
import { publicDeclarationSchema } from "./validation";
import { MAX_FREE_TEXT_LENGTH } from "./constants";

/** Fixed shape a personal, HR-issued invitation always uses. Email REQUIRED
 * (unlike Assessments' OPTIONAL): a candidate result HR can't follow up on
 * by email isn't useful for hiring. */
const PERSONAL_IDENTITY_MODES = { nameMode: IdentityFieldMode.REQUIRED, emailMode: IdentityFieldMode.REQUIRED };

const log = scoped("aptitude.taking");

/**
 * The public path: no sign-in, the link is the whole credential.
 *
 * THE ANSWER KEY MUST NOT LEAVE THIS FILE. Everything a taking page renders
 * comes from `loadForTaking`, whose select lists are written out longhand
 * and never include `isCorrect`.
 */

export type TakingFailure = "UNKNOWN" | "EXPIRED" | "REVOKED" | "ALREADY_SUBMITTED" | "CLOSED" | "TIME_UP";

export type TakingQuestion = {
  id: string;
  kind: AptitudeQuestionKind;
  text: string;
  points: number;
  required: boolean;
  /** Never carries correctness. */
  options: { id: string; text: string }[];
  selectedOptionIds: string[];
  text_answer: string | null;
};

export type TakingSection = {
  id: string;
  title: string;
  description: string | null;
  questions: TakingQuestion[];
};

export type TakingView = {
  invitationId: string;
  attemptId: string;
  testTitle: string;
  testDescription: string | null;
  isPublic: boolean;
  candidateName: string;
  declaredName: string | null;
  identity: { nameMode: IdentityFieldMode; emailMode: IdentityFieldMode };
  /**
   * ISO timestamp, absolute — not "minutes remaining". The client counts
   * down FROM this locally and re-syncs on every autosave response; it
   * never computes its own deadline. Null means untimed.
   */
  deadlineAt: string | null;
  /**
   * The test's configured limit, separate from `deadlineAt` (which is
   * already ticking down by the time this loads — the attempt, and its
   * deadline, are created on first open). Shown on the "before you start"
   * screen so nobody discovers the clock only after starting. Null means
   * untimed.
   */
  timeLimitMinutes: number | null;
  sections: TakingSection[];
};

export type TakingOutcome = { ok: true; view: TakingView } | { ok: false; reason: TakingFailure; message: string };

/**
 * Resolves a token to an attempt, creating the attempt (and its deadline) on
 * first open.
 */
export async function loadForTaking(token: string): Promise<TakingOutcome> {
  const invitation = await prisma.aptitudeInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: {
      id: true,
      candidateName: true,
      isPublic: true,
      expiresAt: true,
      revokedAt: true,
      openedAt: true,
      test: {
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          publicLinkNameMode: true,
          publicLinkEmailMode: true,
          timeLimitMinutes: true,
          sections: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              title: true,
              description: true,
              questions: {
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  kind: true,
                  text: true,
                  points: true,
                  required: true,
                  options: {
                    orderBy: { order: "asc" },
                    // id and text only. Adding isCorrect here would publish
                    // the answer key in the page payload.
                    select: { id: true, text: true },
                  },
                },
              },
            },
          },
        },
      },
      attempt: {
        select: {
          id: true,
          submittedAt: true,
          deadlineAt: true,
          declaredName: true,
          answers: { select: { questionId: true, selectedOptionIds: true, text: true } },
        },
      },
    },
  });

  if (!invitation) return { ok: false, reason: "UNKNOWN", message: "This link is not valid." };
  if (invitation.revokedAt) {
    return { ok: false, reason: "REVOKED", message: "This link has been withdrawn." };
  }
  if (invitation.attempt?.submittedAt) {
    return { ok: false, reason: "ALREADY_SUBMITTED", message: "This has already been completed. Thank you." };
  }
  if (invitation.expiresAt && invitation.expiresAt <= new Date()) {
    return { ok: false, reason: "EXPIRED", message: "This link has expired." };
  }
  if (invitation.test.status !== "PUBLISHED") {
    return { ok: false, reason: "CLOSED", message: "This is no longer open." };
  }

  // Created on first open rather than when the invitation is issued, so
  // `startedAt` means what it says and the deadline is computed against the
  // moment the candidate actually began, not when HR sent the link.
  let attempt = invitation.attempt;
  if (!attempt) {
    const deadlineAt = invitation.test.timeLimitMinutes
      ? new Date(Date.now() + invitation.test.timeLimitMinutes * 60_000)
      : null;
    attempt = await prisma.aptitudeAttempt.create({
      data: { invitationId: invitation.id, deadlineAt },
      select: {
        id: true,
        submittedAt: true,
        deadlineAt: true,
        declaredName: true,
        answers: { select: { questionId: true, selectedOptionIds: true, text: true } },
      },
    });
  }

  if (!invitation.openedAt) {
    await prisma.aptitudeInvitation.update({ where: { id: invitation.id }, data: { openedAt: new Date() } });
  }

  // Already past deadline and never submitted (the candidate closed the tab,
  // or reopened the link after time ran out). Finalise right here rather
  // than making them wait for the next worker sweep.
  if (attempt.deadlineAt && attempt.deadlineAt <= new Date() && !attempt.submittedAt) {
    await finalizeAttempt(attempt.id);
    return {
      ok: false,
      reason: "TIME_UP",
      message: "Time ran out before this was submitted. Your answers up to that point were recorded.",
    };
  }

  const identity = invitation.isPublic
    ? { nameMode: invitation.test.publicLinkNameMode, emailMode: invitation.test.publicLinkEmailMode }
    : PERSONAL_IDENTITY_MODES;

  let declaredName = attempt.declaredName;
  if (declaredName === null && identity.nameMode === "HIDDEN" && identity.emailMode === "HIDDEN") {
    await prisma.aptitudeAttempt.update({
      where: { id: attempt.id },
      data: { declaredName: "", declaredEmail: "" },
    });
    declaredName = "";
  }

  const saved = new Map(attempt.answers.map((a) => [a.questionId, a]));

  return {
    ok: true,
    view: {
      invitationId: invitation.id,
      attemptId: attempt.id,
      testTitle: invitation.test.title,
      testDescription: invitation.test.description,
      isPublic: invitation.isPublic,
      candidateName: invitation.candidateName,
      declaredName,
      identity,
      deadlineAt: attempt.deadlineAt ? attempt.deadlineAt.toISOString() : null,
      timeLimitMinutes: invitation.test.timeLimitMinutes,
      sections: invitation.test.sections.map((section) => ({
        id: section.id,
        title: section.title,
        description: section.description,
        questions: section.questions.map((question) => ({
          id: question.id,
          kind: question.kind,
          text: question.text,
          points: question.points,
          required: question.required,
          options: question.options,
          selectedOptionIds: saved.get(question.id)?.selectedOptionIds ?? [],
          text_answer: saved.get(question.id)?.text ?? null,
        })),
      })),
    },
  };
}

/** Records who the candidate says they are. Same loose-comparison reasoning
 * as Assessments' `declareIdentity` — see that module for the full note. */
export async function declareIdentity(
  token: string,
  raw: { name: unknown; email: unknown },
): Promise<{ ok: boolean; mismatch: boolean; error?: string }> {
  const invitation = await prisma.aptitudeInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: {
      id: true,
      candidateName: true,
      candidateEmail: true,
      isPublic: true,
      test: { select: { publicLinkNameMode: true, publicLinkEmailMode: true } },
      attempt: { select: { id: true, submittedAt: true } },
    },
  });
  if (!invitation?.attempt || invitation.attempt.submittedAt) {
    return { ok: false, mismatch: false };
  }

  const identity = invitation.isPublic
    ? { nameMode: invitation.test.publicLinkNameMode, emailMode: invitation.test.publicLinkEmailMode }
    : PERSONAL_IDENTITY_MODES;

  const parsed = publicDeclarationSchema(identity.nameMode, identity.emailMode).safeParse(raw);
  if (!parsed.success) {
    return { ok: false, mismatch: false, error: parsed.error.issues[0]?.message ?? "Check what you entered." };
  }
  const { name, email } = parsed.data;

  const mismatch = invitation.isPublic
    ? false
    : !namesLookLikeTheSamePerson(name, invitation.candidateName) ||
      (email !== "" && invitation.candidateEmail !== null && email !== invitation.candidateEmail);

  await prisma.aptitudeAttempt.update({
    where: { id: invitation.attempt.id },
    data: { declaredName: name, declaredEmail: email || null, identityMismatch: mismatch },
  });

  if (invitation.isPublic && name) {
    await prisma.aptitudeInvitation.update({ where: { id: invitation.id }, data: { candidateName: name } });
  }

  if (mismatch) {
    log.warn("identity declaration did not match the invitation", { invitationId: invitation.id });
  }
  return { ok: true, mismatch };
}

function namesLookLikeTheSamePerson(a: string, b: string): boolean {
  const normalise = (value: string) =>
    value.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean).sort().join(" ");
  return normalise(a) === normalise(b);
}

/**
 * Saves one answer, per answer rather than all at submission — see
 * Assessments' `saveAnswer` for the reasoning, unchanged here.
 *
 * The deadline check is the real security boundary for the timer: a patched
 * or bypassed client cannot extend it, because nothing the browser does
 * affects this check.
 */
export async function saveAnswer(
  token: string,
  input: { questionId: string; selectedOptionIds?: string[]; text?: string | null },
): Promise<{ ok: boolean }> {
  const invitation = await prisma.aptitudeInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      test: { select: { id: true, status: true } },
      attempt: { select: { id: true, submittedAt: true, deadlineAt: true } },
    },
  });

  const now = new Date();
  if (
    !invitation?.attempt ||
    invitation.attempt.submittedAt ||
    invitation.revokedAt ||
    (invitation.expiresAt && invitation.expiresAt <= now) ||
    (invitation.attempt.deadlineAt && invitation.attempt.deadlineAt <= now) ||
    invitation.test.status !== "PUBLISHED"
  ) {
    return { ok: false };
  }

  const question = await prisma.aptitudeQuestion.findFirst({
    where: { id: input.questionId, section: { testId: invitation.test.id } },
    select: { id: true, kind: true, options: { select: { id: true } } },
  });
  if (!question) return { ok: false };

  const validOptionIds = new Set(question.options.map((o) => o.id));
  let selected = (input.selectedOptionIds ?? []).filter((id) => validOptionIds.has(id));

  if (question.kind === AptitudeQuestionKind.SINGLE_CHOICE && selected.length > 1) {
    selected = selected.slice(0, 1);
  }
  if (question.kind === AptitudeQuestionKind.FREE_TEXT) selected = [];

  const text =
    question.kind === AptitudeQuestionKind.FREE_TEXT ? (input.text ?? "").slice(0, MAX_FREE_TEXT_LENGTH) : null;

  await prisma.aptitudeAnswer.upsert({
    where: { attemptId_questionId: { attemptId: invitation.attempt.id, questionId: question.id } },
    create: { attemptId: invitation.attempt.id, questionId: question.id, selectedOptionIds: selected, text },
    update: { selectedOptionIds: selected, text },
  });

  return { ok: true };
}

export type TabAbsence = { leftAt: string; durationMs: number };

/** Sanity cap, not a real limit anyone should hit — stops a stuck or
 * malicious client from growing this column without bound. */
const MAX_TAB_ABSENCES = 200;

/**
 * Anti-cheating signal, not enforcement — see the schema note on
 * `AptitudeAttempt.tabAbsences`. Called once per hidden-then-visible-again
 * cycle, from the client; nothing here blocks the attempt or changes its
 * deadline. Silently no-ops on bad input rather than erroring, since a
 * rejected call here would just look like a dropped request to the
 * candidate and isn't worth surfacing to them either way.
 */
export async function recordTabAbsence(
  token: string,
  input: { leftAt: string; durationMs: number },
): Promise<{ ok: boolean }> {
  if (!Number.isFinite(input.durationMs) || input.durationMs <= 0 || input.durationMs > 24 * 60 * 60_000) {
    return { ok: false };
  }
  const leftAt = new Date(input.leftAt);
  if (Number.isNaN(leftAt.getTime())) return { ok: false };

  const invitation = await prisma.aptitudeInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: { attempt: { select: { id: true, submittedAt: true, tabAbsences: true } } },
  });
  if (!invitation?.attempt || invitation.attempt.submittedAt) return { ok: false };

  const existing = (
    Array.isArray(invitation.attempt.tabAbsences) ? invitation.attempt.tabAbsences : []
  ) as TabAbsence[];
  const next = [...existing, { leftAt: leftAt.toISOString(), durationMs: Math.round(input.durationMs) }].slice(
    -MAX_TAB_ABSENCES,
  );

  await prisma.aptitudeAttempt.update({
    where: { id: invitation.attempt.id },
    data: { tabAbsences: next },
  });

  return { ok: true };
}

export type SubmitOutcome =
  | { ok: true; showScore: boolean; scoredPoints: number; maxPoints: number; percent: number | null }
  | { ok: false; reason: TakingFailure | "INCOMPLETE"; message: string; unanswered?: string[] };

/**
 * Finalises an attempt, via the shared `finalizeAttempt`.
 *
 * Past the deadline, this NEVER refuses for being late and NEVER blocks on
 * incomplete required questions — `saveAnswer` already stopped taking new
 * answers the moment the deadline passed, so refusing the submit itself
 * would leave the candidate stuck with no way to finish. Before the
 * deadline, it behaves like an ordinary submit: incomplete required
 * questions block with a list of which ones, same as Assessments.
 */
export async function submitResponse(token: string): Promise<SubmitOutcome> {
  const invitation = await prisma.aptitudeInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      test: {
        select: {
          id: true,
          status: true,
          showScoreToCandidate: true,
          // Only what `unansweredRequired` actually reads — id, kind,
          // required. Neither points nor correctness are needed to check
          // completeness, so neither is fetched here.
          sections: { select: { questions: { select: { id: true, kind: true, required: true } } } },
        },
      },
      attempt: {
        select: {
          id: true,
          submittedAt: true,
          deadlineAt: true,
          answers: { select: { questionId: true, selectedOptionIds: true, text: true } },
        },
      },
    },
  });

  if (!invitation?.attempt) return { ok: false, reason: "UNKNOWN", message: "This link is not valid." };
  if (invitation.attempt.submittedAt) {
    return { ok: false, reason: "ALREADY_SUBMITTED", message: "This was already submitted." };
  }
  if (invitation.revokedAt) return { ok: false, reason: "REVOKED", message: "This link has been withdrawn." };
  if (invitation.expiresAt && invitation.expiresAt <= new Date()) {
    return { ok: false, reason: "EXPIRED", message: "This link has expired." };
  }
  if (invitation.test.status !== "PUBLISHED") {
    return { ok: false, reason: "CLOSED", message: "This is no longer open." };
  }

  const pastDeadline = invitation.attempt.deadlineAt !== null && invitation.attempt.deadlineAt <= new Date();

  if (!pastDeadline) {
    // `points` and `options` are never read by `unansweredRequired` — filled
    // with harmless placeholders purely to satisfy `ScorableQuestion`'s
    // shape, not fetched from the database.
    const questions: (ScorableQuestion & { required: boolean })[] = invitation.test.sections.flatMap((section) =>
      section.questions.map((question) => ({
        id: question.id,
        kind: question.kind,
        points: 0,
        required: question.required,
        options: [],
      })),
    );
    const answers = invitation.attempt.answers.map((a) => ({
      questionId: a.questionId,
      selectedOptionIds: a.selectedOptionIds,
      text: a.text,
    }));
    const missing = unansweredRequired(questions, answers);
    if (missing.length > 0) {
      return {
        ok: false,
        reason: "INCOMPLETE",
        message:
          missing.length === 1 ? "One question still needs an answer." : `${missing.length} questions still need an answer.`,
        unanswered: missing,
      };
    }
  }

  const result = await finalizeAttempt(invitation.attempt.id);
  if (!result.ok) return { ok: false, reason: "UNKNOWN", message: "This link is not valid." };

  return {
    ok: true,
    showScore: invitation.test.showScoreToCandidate,
    scoredPoints: result.scoredPoints,
    maxPoints: result.maxPoints,
    percent: result.percent,
  };
}
