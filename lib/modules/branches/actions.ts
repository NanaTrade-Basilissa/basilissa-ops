"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import {
  requireAuth,
  requireMfaIfNeeded,
  can,
  auditActorFrom,
  requireBranchPermission,
} from "@/lib/modules/identity/server";
import { auditSnapshot, recordAudit } from "@/lib/platform/audit";
import {
  listConfigurableRecipientsForBranch,
  saveBranchFeedbackRecipients,
  type SaveRecipientInput,
} from "@/lib/modules/feedback/server";
import type { ConfigurableRecipient } from "@/lib/modules/feedback/constants";
import { branchInputSchema, branchGeofenceUpdateSchema } from "./validation";
import { fieldErrorsFrom, type FormState } from "@/lib/platform/forms";

export type BranchFormState = FormState;

const AUDITED_FIELDS = [
  "name",
  "slug",
  "location",
  "isActive",
  "latitude",
  "longitude",
  "geofenceRadiusMeters",
  "geofenceEnabled",
] as const;

function parseCoord(val: FormDataEntryValue | null): number | null {
  if (!val || typeof val !== "string" || !val.trim()) return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

function parseBranchForm(formData: FormData) {
  const rawRadius = formData.get("geofenceRadiusMeters");
  const radius = rawRadius ? Number(rawRadius) : 150;

  return branchInputSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    location: formData.get("location"),
    isActive: formData.get("isActive") === "on",
    latitude: parseCoord(formData.get("latitude")),
    longitude: parseCoord(formData.get("longitude")),
    geofenceRadiusMeters: Number.isFinite(radius) && radius > 0 ? radius : 150,
    geofenceEnabled: formData.get("geofenceEnabled") === "on",
  });
}

export async function createBranch(
  _prevState: BranchFormState,
  formData: FormData,
): Promise<BranchFormState> {
  const actor = await requireAuth();
  await requireMfaIfNeeded(actor);
  if (!can(actor, "branch:write")) {
    return { error: "You do not have permission to create branches." };
  }

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
  return { success: true };
}

export async function updateBranch(
  branchId: string,
  _prevState: BranchFormState,
  formData: FormData,
): Promise<BranchFormState> {
  const actor = await requireAuth();
  await requireMfaIfNeeded(actor);
  if (!can(actor, "branch:write", { branchId })) {
    return { error: "You do not have permission to update this branch." };
  }

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
  return { success: true };
}

export async function toggleBranchActive(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const actor = await requireAuth();
  await requireMfaIfNeeded(actor);
  if (!can(actor, "branch:write", { branchId: id })) {
    throw new Error("Unauthorized to modify branch");
  }

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

export async function toggleGeofenceEnabled(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const actor = await requireAuth();
  await requireMfaIfNeeded(actor);
  if (!can(actor, "branch:write", { branchId: id })) {
    throw new Error("Unauthorized to modify branch geofence");
  }

  const nextGeofenceEnabled = formData.get("nextGeofenceEnabled") === "true";

  await prisma.$transaction(async (tx) => {
    const before = await tx.branch.findUniqueOrThrow({ where: { id } });

    if (nextGeofenceEnabled && (before.latitude == null || before.longitude == null)) {
      throw new Error("Cannot enable geofencing without branch coordinates. Set latitude and longitude first.");
    }

    const after = await tx.branch.update({
      where: { id },
      data: { geofenceEnabled: nextGeofenceEnabled },
    });

    await recordAudit(
      {
        actor: auditActorFrom(actor),
        action: nextGeofenceEnabled ? "branch.geofence.enabled" : "branch.geofence.disabled",
        entityType: "Branch",
        entityId: id,
        before: auditSnapshot(before, AUDITED_FIELDS),
        after: auditSnapshot(after, AUDITED_FIELDS),
      },
      tx,
    );
  });

  revalidatePath("/admin/branches");
  revalidatePath(`/admin/branches/${id}`);
  revalidatePath("/admin");
}

export async function updateBranchGeofence(
  branchId: string,
  _prevState: BranchFormState,
  formData: FormData,
): Promise<BranchFormState> {
  const actor = await requireAuth();
  await requireMfaIfNeeded(actor);
  if (!can(actor, "branch:write", { branchId })) {
    return { error: "You do not have permission to update branch geofencing." };
  }

  const rawRadius = formData.get("geofenceRadiusMeters");
  const radius = rawRadius ? Number(rawRadius) : 150;
  const rawMaxAcc = formData.get("maxAcceptableAccuracyMeters");
  const maxAcc = rawMaxAcc ? Number(rawMaxAcc) : 100;

  const parsed = branchGeofenceUpdateSchema.safeParse({
    latitude: parseCoord(formData.get("latitude")),
    longitude: parseCoord(formData.get("longitude")),
    geofenceRadiusMeters: radius,
    maxAcceptableAccuracyMeters: maxAcc,
    geofenceEnabled: formData.get("geofenceEnabled") === "on" || formData.get("geofenceEnabled") === "true",
  });

  if (!parsed.success) {
    return { error: "Please fix the coordinate errors.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  if (parsed.data.geofenceEnabled && (parsed.data.latitude == null || parsed.data.longitude == null)) {
    return {
      error: "Coordinates required",
      fieldErrors: {
        latitude: "Latitude is required when geofencing is enabled",
        longitude: "Longitude is required when geofencing is enabled",
      },
    };
  }

  await prisma.$transaction(async (tx) => {
    const before = await tx.branch.findUniqueOrThrow({ where: { id: branchId } });
    const after = await tx.branch.update({
      where: { id: branchId },
      data: {
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        geofenceRadiusMeters: parsed.data.geofenceRadiusMeters,
        maxAcceptableAccuracyMeters: parsed.data.maxAcceptableAccuracyMeters,
        geofenceEnabled: parsed.data.geofenceEnabled,
      },
    });

    await recordAudit(
      {
        actor: auditActorFrom(actor),
        action: "branch.geofence.updated",
        entityType: "Branch",
        entityId: branchId,
        before: auditSnapshot(before, AUDITED_FIELDS),
        after: auditSnapshot(after, AUDITED_FIELDS),
      },
      tx,
    );
  });

  revalidatePath("/admin/branches");
  revalidatePath(`/admin/branches/${branchId}`);
  revalidatePath("/admin");
  return { success: true };
}

const recipientItemSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  name: z.string().trim().max(120).optional(),
  roleLabel: z.string().trim().max(100).optional(),
  userId: z.string().nullish(),
  enabled: z.boolean(),
});

const saveRecipientsSchema = z.object({
  branchId: z.string().min(1),
  recipients: z.array(recipientItemSchema),
});

export async function getBranchRecipientsAction(
  branchId: string,
): Promise<{ success: boolean; data?: ConfigurableRecipient[]; error?: string }> {
  try {
    await requireBranchPermission("branch:read", branchId);
    const data = await listConfigurableRecipientsForBranch(branchId);
    return { success: true, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load recipients";
    return { success: false, error: message };
  }
}

export async function saveBranchRecipientsAction(
  branchId: string,
  recipients: SaveRecipientInput[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireBranchPermission("branch:write", branchId);
    const parsed = saveRecipientsSchema.parse({ branchId, recipients });
    await saveBranchFeedbackRecipients(branchId, parsed.recipients, actor);
    revalidatePath(`/admin/branches/${branchId}`);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save recipients";
    return { success: false, error: message };
  }
}

