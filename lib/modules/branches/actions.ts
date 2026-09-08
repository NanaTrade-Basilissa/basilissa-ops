"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import {
  requireBranchPermission,
  requirePermission,
  auditActorFrom,
} from "@/lib/modules/identity/server";
import { auditSnapshot, recordAudit } from "@/lib/platform/audit";
import { branchInputSchema } from "./validation";
import { fieldErrorsFrom, type FormState } from "@/lib/platform/forms";

export type BranchFormState = FormState;

/** The fields worth diffing. `updatedAt` changes on every write and says nothing. */
const AUDITED_FIELDS = ["name", "slug", "location", "isActive"] as const;

function parseBranchForm(formData: FormData) {
  return branchInputSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    location: formData.get("location"),
    isActive: formData.get("isActive") === "on",
  });
}

export async function createBranch(
  _prevState: BranchFormState,
  formData: FormData,
): Promise<BranchFormState> {
  // No branch named, which `can` treats as requiring a GLOBAL grant. That is
  // exactly right here: an area manager holds branch:write over the branches
  // they run, and running a branch is not authority to invent one.
  const actor = await requirePermission("branch:write");

  const parsed = parseBranchForm(formData);
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  try {
    // One transaction: the branch and the record of who created it commit
    // together, or neither does.
    await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.create({ data: parsed.data });
      await recordAudit(
        {
          actor: auditActorFrom(actor),
          action: "branch.created",
          entityType: "Branch",
          entityId: branch.id,
          after: auditSnapshot(branch, AUDITED_FIELDS),
        },
        tx,
      );
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "A branch with that slug already exists.", fieldErrors: { slug: "Already in use" } };
    }
    throw error;
  }

  revalidatePath("/admin/branches");
  revalidatePath("/admin");
  redirect("/admin/branches");
}

export async function updateBranch(
  branchId: string,
  _prevState: BranchFormState,
  formData: FormData,
): Promise<BranchFormState> {
  const actor = await requireBranchPermission("branch:write", branchId);

  const parsed = parseBranchForm(formData);
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.branch.findUniqueOrThrow({ where: { id: branchId } });
      const after = await tx.branch.update({ where: { id: branchId }, data: parsed.data });
      await recordAudit(
        {
          actor: auditActorFrom(actor),
          action: "branch.updated",
          entityType: "Branch",
          entityId: branchId,
          before: auditSnapshot(before, AUDITED_FIELDS),
          after: auditSnapshot(after, AUDITED_FIELDS),
        },
        tx,
      );
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "A branch with that slug already exists.", fieldErrors: { slug: "Already in use" } };
    }
    throw error;
  }

  revalidatePath("/admin/branches");
  revalidatePath(`/admin/branches/${branchId}`);
  revalidatePath("/admin");
  redirect(`/admin/branches/${branchId}`);
}

export async function toggleBranchActive(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  // Read the id before the gate: which branch is being closed decides whether
  // this caller may close it.
  const actor = await requireBranchPermission("branch:write", id);

  const nextIsActive = formData.get("nextIsActive") === "true";

  await prisma.$transaction(async (tx) => {
    const before = await tx.branch.findUniqueOrThrow({ where: { id } });
    await tx.branch.update({ where: { id }, data: { isActive: nextIsActive } });
    await recordAudit(
      {
        actor: auditActorFrom(actor),
        // Distinct verbs rather than one "branch.updated": deactivating a
        // branch stops it accepting feedback, so it is worth finding on its
        // own rather than by reading diffs.
        action: nextIsActive ? "branch.activated" : "branch.deactivated",
        entityType: "Branch",
        entityId: id,
        before: auditSnapshot(before, AUDITED_FIELDS),
        after: auditSnapshot({ ...before, isActive: nextIsActive }, AUDITED_FIELDS),
      },
      tx,
    );
  });

  revalidatePath("/admin/branches");
  revalidatePath(`/admin/branches/${id}`);
  revalidatePath("/admin");
}
