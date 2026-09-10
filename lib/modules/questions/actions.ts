"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/platform/prisma";
import { requirePermission, auditActorFrom } from "@/lib/modules/identity/server";
import { auditSnapshot, recordAudit } from "@/lib/platform/audit";
import { questionInputSchema } from "./validation";
import { FEEDBACK_QUESTION_COUNT } from "@/lib/modules/feedback/constants";
import { fieldErrorsFrom, type FormState } from "@/lib/platform/forms";

export type QuestionFormState = FormState;

/** Fields worth diffing. Order is audited separately, by moveQuestion. */
const AUDITED_FIELDS = ["text", "isActive", "ratingLabels", "order"] as const;

const ACTIVE_CAP = FEEDBACK_QUESTION_COUNT;
const CAP_MESSAGE = `Only ${ACTIVE_CAP} questions can be active at a time - the customer form always shows exactly ${ACTIVE_CAP}. Deactivate another question first.`;

function parseQuestionForm(formData: FormData) {
  return questionInputSchema.safeParse({
    text: formData.get("text"),
    isActive: formData.get("isActive") === "on",
    ratingLabels: [1, 2, 3, 4, 5].map((score) => formData.get(`ratingLabel${score}`)),
  });
}

async function countActive(excludeId?: string): Promise<number> {
  return prisma.question.count({
    where: { isActive: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
}

export async function createQuestion(
  _prevState: QuestionFormState,
  formData: FormData,
): Promise<QuestionFormState> {
  const actor = await requirePermission("question:write");

  const parsed = parseQuestionForm(formData);
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  if (parsed.data.isActive && (await countActive()) >= ACTIVE_CAP) {
    return { error: CAP_MESSAGE, fieldErrors: { isActive: "Active question limit reached" } };
  }

  const last = await prisma.question.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
  const nextOrder = (last?.order ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    const question = await tx.question.create({
      data: {
        text: parsed.data.text,
        isActive: parsed.data.isActive,
        ratingLabels: parsed.data.ratingLabels,
        order: nextOrder,
      },
    });
    await recordAudit(
      {
        actor: auditActorFrom(actor),
        action: "question.created",
        entityType: "Question",
        entityId: question.id,
        after: auditSnapshot(question, AUDITED_FIELDS),
      },
      tx,
    );
  });

  revalidatePath("/admin/feedback/questions");
  return { success: true };
}

export async function updateQuestion(
  questionId: string,
  _prevState: QuestionFormState,
  formData: FormData,
): Promise<QuestionFormState> {
  const actor = await requirePermission("question:write");

  const parsed = parseQuestionForm(formData);
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  if (parsed.data.isActive && (await countActive(questionId)) >= ACTIVE_CAP) {
    return { error: CAP_MESSAGE, fieldErrors: { isActive: "Active question limit reached" } };
  }

  await prisma.$transaction(async (tx) => {
    const before = await tx.question.findUniqueOrThrow({ where: { id: questionId } });
    const after = await tx.question.update({
      where: { id: questionId },
      data: { text: parsed.data.text, isActive: parsed.data.isActive, ratingLabels: parsed.data.ratingLabels },
    });
    await recordAudit(
      {
        actor: auditActorFrom(actor),
        action: "question.updated",
        entityType: "Question",
        entityId: questionId,
        before: auditSnapshot(before, AUDITED_FIELDS),
        after: auditSnapshot(after, AUDITED_FIELDS),
      },
      tx,
    );
  });

  revalidatePath("/admin/feedback/questions");
  return { success: true };
}

/** Quick activate/deactivate from the list row — mirrors toggleBranchActive,
 * but activation can fail (the 5-question cap), so failures redirect back
 * with `?error=` instead of throwing. */
export async function toggleQuestionActive(formData: FormData): Promise<void> {
  const actor = await requirePermission("question:write");

  const id = String(formData.get("id"));
  const nextIsActive = formData.get("nextIsActive") === "true";

  if (nextIsActive && (await countActive(id)) >= ACTIVE_CAP) {
    redirect(`/admin/feedback/questions?error=${encodeURIComponent(CAP_MESSAGE)}`);
  }

  await prisma.$transaction(async (tx) => {
    const before = await tx.question.findUniqueOrThrow({ where: { id } });
    await tx.question.update({ where: { id }, data: { isActive: nextIsActive } });
    await recordAudit(
      {
        actor: auditActorFrom(actor),
        // Deactivating changes what every customer is asked, so it is worth
        // finding directly rather than by diffing updates.
        action: nextIsActive ? "question.activated" : "question.deactivated",
        entityType: "Question",
        entityId: id,
        before: auditSnapshot(before, AUDITED_FIELDS),
        after: auditSnapshot({ ...before, isActive: nextIsActive }, AUDITED_FIELDS),
      },
      tx,
    );
  });

  revalidatePath("/admin/feedback/questions");
}

/** Swaps this question's display order with its immediate neighbor. `order`
 * is a unique column, so the swap goes through a temporary sentinel value
 * to avoid colliding with the neighbor's current order mid-transaction. */
export async function moveQuestion(formData: FormData): Promise<void> {
  const actor = await requirePermission("question:write");

  const id = String(formData.get("id"));
  const direction = formData.get("direction") === "up" ? "up" : "down";

  const current = await prisma.question.findUnique({ where: { id }, select: { order: true } });
  if (!current) return;

  const neighbor = await prisma.question.findFirst({
    where: direction === "up" ? { order: { lt: current.order } } : { order: { gt: current.order } },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
    select: { id: true, order: true },
  });
  if (!neighbor) return;

  await prisma.$transaction(async (tx) => {
    await tx.question.update({ where: { id }, data: { order: -1 } });
    await tx.question.update({ where: { id: neighbor.id }, data: { order: current.order } });
    await tx.question.update({ where: { id }, data: { order: neighbor.order } });

    // Both questions moved, so both get an entry — reading either one's
    // history should show the swap, not a gap.
    await recordAudit(
      {
        actor: auditActorFrom(actor),
        action: "question.reordered",
        entityType: "Question",
        entityId: id,
        before: { order: current.order },
        after: { order: neighbor.order },
        metadata: { direction, swappedWith: neighbor.id },
      },
      tx,
    );
    await recordAudit(
      {
        actor: auditActorFrom(actor),
        action: "question.reordered",
        entityType: "Question",
        entityId: neighbor.id,
        before: { order: neighbor.order },
        after: { order: current.order },
        metadata: { direction: direction === "up" ? "down" : "up", swappedWith: id },
      },
      tx,
    );
  });

  revalidatePath("/admin/feedback/questions");
}
