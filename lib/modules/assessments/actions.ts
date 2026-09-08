"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditActorFrom, requirePermission } from "@/lib/modules/identity/server";
import { fieldErrorsFrom, type FormState } from "@/lib/platform/forms";

/**
 * `FormState` already includes undefined, so intersecting with it would make
 * the whole type non-optional. Extend the non-null half and re-add undefined —
 * the same shape `PolicyFormState` uses.
 */
export type AssessmentFormState =
  | (NonNullable<FormState> & { saved?: boolean })
  | undefined;
import { getEnv, isEmailConfigured } from "@/lib/platform/env";
import { enqueue } from "@/lib/platform/jobs";
import { rateLimit } from "@/lib/platform/rate-limit";
import { headers } from "next/headers";
import {
  assessmentDetailsSchema,
  answerSchema,
  invitationSchema,
  publicLinkConfigSchema,
  questionSchema,
  sectionSchema,
} from "./validation";
import {
  addQuestion,
  addSection,
  closeAssessment,
  createAssessment,
  deleteAssessment,
  deleteQuestion,
  publishAssessment,
  updateAssessmentDetails,
} from "./authoring";
import {
  issueInvitation,
  issueInvitations,
  resendInvitation,
  revokeInvitation,
  setPublicLinkConfig,
  type IssuedInvitation,
} from "./invitations";
import { ASSESSMENT_INVITATION_SEND } from "./jobs";
import { declareIdentity, saveAnswer, submitResponse } from "./taking";

// ---------------------------------------------------------------------------
// HR side. Everything here re-checks the permission: a Server Action is
// reachable by direct POST without the page in front of it.
// ---------------------------------------------------------------------------

export async function createAssessmentAction(
  _prev: AssessmentFormState,
  formData: FormData,
): Promise<AssessmentFormState> {
  const actor = await requirePermission("assessment:write");

  const parsed = assessmentDetailsSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    showScoreToTaker: formData.get("showScoreToTaker") === "on",
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const created = await createAssessment(parsed.data, auditActorFrom(actor));
  revalidatePath("/admin/assessments");
  redirect(`/admin/assessments/${created.assessmentId}`);
}

export async function updateAssessmentAction(
  assessmentId: string,
  _prev: AssessmentFormState,
  formData: FormData,
): Promise<AssessmentFormState> {
  const actor = await requirePermission("assessment:write");

  const parsed = assessmentDetailsSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    showScoreToTaker: formData.get("showScoreToTaker") === "on",
    passMarkPercent: formData.get("passMarkPercent") || undefined,
    invitationsExpire: formData.get("invitationsExpire") === "on",
    invitationTtlHours: formData.get("invitationTtlHours") || undefined,
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const outcome = await updateAssessmentDetails(assessmentId, parsed.data, auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath(`/admin/assessments/${assessmentId}`);
  return { saved: true };
}

/** Turns the public link on/off and sets its identity modes. */
export async function updatePublicLinkAction(
  assessmentId: string,
  _prev: AssessmentFormState,
  formData: FormData,
): Promise<AssessmentFormState> {
  const actor = await requirePermission("assessment:write");

  const parsed = publicLinkConfigSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    nameMode: formData.get("nameMode"),
    emailMode: formData.get("emailMode"),
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const outcome = await setPublicLinkConfig(assessmentId, parsed.data, auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message ?? "Could not update the public link." };

  revalidatePath(`/admin/assessments/${assessmentId}`);
  return { saved: true };
}

export async function addSectionAction(
  assessmentId: string,
  _prev: AssessmentFormState,
  formData: FormData,
): Promise<AssessmentFormState> {
  const actor = await requirePermission("assessment:write");

  const parsed = sectionSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const outcome = await addSection(assessmentId, parsed.data, auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath(`/admin/assessments/${assessmentId}`);
  return { saved: true };
}

export async function addQuestionAction(
  assessmentId: string,
  _prev: AssessmentFormState,
  formData: FormData,
): Promise<AssessmentFormState> {
  const actor = await requirePermission("assessment:write");

  // Option rows arrive as parallel arrays from the form.
  const texts = formData.getAll("optionText").map(String);
  const correctIndexes = new Set(formData.getAll("optionCorrect").map((v) => String(v)));

  const parsed = questionSchema.safeParse({
    sectionId: formData.get("sectionId"),
    kind: formData.get("kind"),
    text: formData.get("text"),
    points: formData.get("points"),
    required: formData.get("required") === "on",
    options: texts
      .map((text, index) => ({ text, isCorrect: correctIndexes.has(String(index)) }))
      .filter((option) => option.text.trim().length > 0),
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const outcome = await addQuestion(parsed.data.sectionId, parsed.data, auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath(`/admin/assessments/${assessmentId}`);
  return { saved: true };
}

export async function deleteQuestionAction(
  assessmentId: string,
  _prev: AssessmentFormState,
  formData: FormData,
): Promise<AssessmentFormState> {
  const actor = await requirePermission("assessment:write");
  const outcome = await deleteQuestion(
    String(formData.get("questionId") ?? ""),
    auditActorFrom(actor),
  );
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath(`/admin/assessments/${assessmentId}`);
  return { saved: true };
}

export async function publishAssessmentAction(
  assessmentId: string,
  _prev: AssessmentFormState,
  _formData: FormData,
): Promise<AssessmentFormState> {
  const actor = await requirePermission("assessment:write");
  const outcome = await publishAssessment(assessmentId, auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath(`/admin/assessments/${assessmentId}`);
  return { saved: true };
}

export async function closeAssessmentAction(
  assessmentId: string,
  _prev: AssessmentFormState,
  _formData: FormData,
): Promise<AssessmentFormState> {
  const actor = await requirePermission("assessment:write");
  const outcome = await closeAssessment(assessmentId, auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath(`/admin/assessments/${assessmentId}`);
  return { saved: true };
}

export async function deleteAssessmentAction(
  assessmentId: string,
  _prev: AssessmentFormState,
  _formData: FormData,
): Promise<AssessmentFormState> {
  const actor = await requirePermission("assessment:write");
  const outcome = await deleteAssessment(assessmentId, auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message };

  revalidatePath("/admin/assessments");
  redirect("/admin/assessments");
}

export type InviteState =
  | {
      error?: string;
      fieldErrors?: Record<string, string>;
      /**
       * Shown once. The link IS the credential, so it is displayed rather than
       * stored anywhere readable — HR copies it into whatever they use to
       * reach that person.
       */
      link?: { url: string; name: string; expiresAt: string | null; emailed: boolean };
    }
  | undefined;

/**
 * Enqueues the invitation email when there is an address to send it to and
 * email is actually configured. Either way the link is still returned to the
 * caller — HR needs it when there is no address, and it is the fallback when
 * there is one but sending is not set up, so nothing is silently lost.
 */
async function maybeEnqueueInvitationEmail(invitation: IssuedInvitation): Promise<boolean> {
  if (!invitation.inviteeEmail || !isEmailConfigured()) return false;

  await enqueue(ASSESSMENT_INVITATION_SEND, {
    email: invitation.inviteeEmail,
    token: invitation.token,
    expiresAt: invitation.expiresAt?.toISOString() ?? null,
    assessmentTitle: invitation.assessmentTitle,
    inviteeName: invitation.inviteeName,
  });
  return true;
}

export async function inviteToAssessmentAction(
  assessmentId: string,
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const actor = await requirePermission("assessment:write");

  const parsed = invitationSchema.safeParse({
    assessmentId,
    employeeId: formData.get("employeeId") || undefined,
    name: formData.get("name") || undefined,
    email: formData.get("email") || undefined,
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const outcome = await issueInvitation(parsed.data, auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message };

  const emailed = await maybeEnqueueInvitationEmail(outcome.invitation);

  revalidatePath(`/admin/assessments/${assessmentId}`);
  return {
    link: {
      url: `${getEnv().NEXT_PUBLIC_APP_URL}/assessment/${encodeURIComponent(outcome.invitation.token)}`,
      name: outcome.invitation.inviteeName,
      expiresAt: outcome.invitation.expiresAt?.toISOString() ?? null,
      emailed,
    },
  };
}

/**
 * Sends a fresh link and withdraws the one it replaces.
 *
 * Not a re-send of the original: only its hash is stored, so the original
 * token cannot be recovered. `resendInvitation` issues a new invitation and
 * revokes the old one, in that order, so a person is never left holding two
 * live links — or, if issuing fails, zero.
 */
export async function resendInvitationAction(
  assessmentId: string,
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const actor = await requirePermission("assessment:write");

  const invitationId = String(formData.get("invitationId") ?? "");
  if (!invitationId) return { error: "Nothing to resend." };

  const outcome = await resendInvitation(invitationId, auditActorFrom(actor));
  if (!outcome.ok) return { error: outcome.message };

  const emailed = await maybeEnqueueInvitationEmail(outcome.invitation);

  revalidatePath(`/admin/assessments/${assessmentId}`);
  return {
    link: {
      url: `${getEnv().NEXT_PUBLIC_APP_URL}/assessment/${encodeURIComponent(outcome.invitation.token)}`,
      name: outcome.invitation.inviteeName,
      expiresAt: outcome.invitation.expiresAt?.toISOString() ?? null,
      emailed,
    },
  };
}

export type BulkInviteState =
  | {
      error?: string;
      summary?: {
        invited: number;
        emailed: number;
        failures: { name: string; message: string }[];
      };
    }
  | undefined;

/** Sends one assessment to a whole branch or team in a single submit. */
export async function inviteManyToAssessmentAction(
  assessmentId: string,
  _prev: BulkInviteState,
  formData: FormData,
): Promise<BulkInviteState> {
  const actor = await requirePermission("assessment:write");

  const employeeIds = [...new Set(formData.getAll("employeeId").map(String).filter(Boolean))];
  if (employeeIds.length === 0) return { error: "Choose at least one person." };

  const { invitations, failures } = await issueInvitations(
    assessmentId,
    employeeIds,
    auditActorFrom(actor),
  );

  let emailed = 0;
  for (const invitation of invitations) {
    if (await maybeEnqueueInvitationEmail(invitation)) emailed += 1;
  }

  revalidatePath(`/admin/assessments/${assessmentId}`);
  return { summary: { invited: invitations.length, emailed, failures } };
}

export async function revokeInvitationAction(
  assessmentId: string,
  _prev: AssessmentFormState,
  formData: FormData,
): Promise<AssessmentFormState> {
  const actor = await requirePermission("assessment:write");
  const outcome = await revokeInvitation(
    String(formData.get("invitationId") ?? ""),
    auditActorFrom(actor),
  );
  if (!outcome.ok) return { error: outcome.message ?? "Could not withdraw that link." };

  revalidatePath(`/admin/assessments/${assessmentId}`);
  return { saved: true };
}

// ---------------------------------------------------------------------------
// Public side. No session; the token is the whole credential, so every action
// takes it and re-resolves it. Rate limited because these are unauthenticated
// endpoints that write.
// ---------------------------------------------------------------------------

async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headerList.get("x-real-ip")?.trim() ?? "unknown";
}

export type DeclarationState = { error?: string; done?: boolean } | undefined;

export async function declareIdentityAction(
  token: string,
  _prev: DeclarationState,
  formData: FormData,
): Promise<DeclarationState> {
  const limit = await rateLimit(`assessment-declare:${await clientIp()}`, 30, 15 * 60 * 1000);
  if (!limit.success) return { error: "Too many attempts. Please try again shortly." };

  // Validated inside `declareIdentity`, not here: which fields are required,
  // optional or not asked at all depends on the invitation (personal vs. a
  // public link's configured modes), which only a DB lookup can resolve.
  const outcome = await declareIdentity(token, {
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!outcome.ok) return { error: outcome.error ?? "This link is no longer usable." };

  // The mismatch is NOT reported back. Telling the taker their name did not
  // match the invitation teaches whoever is sitting it on somebody's behalf
  // exactly what to type instead.
  revalidatePath(`/assessment/${token}`);
  return { done: true };
}

export type AnswerState = { error?: string; savedQuestionId?: string } | undefined;

export async function saveAnswerAction(
  token: string,
  _prev: AnswerState,
  formData: FormData,
): Promise<AnswerState> {
  const limit = await rateLimit(`assessment-answer:${await clientIp()}`, 600, 60 * 60 * 1000);
  if (!limit.success) return { error: "Too many changes at once. Please slow down." };

  const parsed = answerSchema.safeParse({
    questionId: formData.get("questionId"),
    selectedOptionIds: formData.getAll("optionId").map(String),
    text: formData.get("text") ? String(formData.get("text")) : undefined,
  });
  if (!parsed.success) return { error: "That answer could not be saved." };

  const outcome = await saveAnswer(token, parsed.data);
  if (!outcome.ok) return { error: "This link is no longer usable." };

  return { savedQuestionId: parsed.data.questionId };
}

export type SubmitState =
  | { error?: string; unanswered?: string[] }
  | undefined;

export async function submitAssessmentAction(
  token: string,
  _prev: SubmitState,
): Promise<SubmitState> {
  const limit = await rateLimit(`assessment-submit:${await clientIp()}`, 20, 15 * 60 * 1000);
  if (!limit.success) return { error: "Too many attempts. Please try again shortly." };

  const outcome = await submitResponse(token);
  if (!outcome.ok) {
    return { error: outcome.message, unanswered: "unanswered" in outcome ? outcome.unanswered : undefined };
  }

  redirect(`/assessment/${token}/done`);
}
