"use server";

import { revalidatePath } from "next/cache";
import { Prisma, ProviderType } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { requireAuth, requireMfaIfNeeded, can, auditActorFrom } from "@/lib/modules/identity/server";
import { auditSnapshot, recordAudit } from "@/lib/platform/audit";
import { deviceInputSchema, deviceUpdateSchema } from "./validation";
import { fieldErrorsFrom, type FormState } from "@/lib/platform/forms";

export type DeviceFormState = FormState;

const AUDITED_FIELDS = ["serialNumber", "branchId", "label", "isActive"] as const;

const DUPLICATE_SERIAL_ERROR = {
  error: "A device with that serial number is already registered.",
  fieldErrors: { serialNumber: "Already in use" },
};

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createDevice(
  _prevState: DeviceFormState,
  formData: FormData,
): Promise<DeviceFormState> {
  const actor = await requireAuth();
  await requireMfaIfNeeded(actor);

  const parsed = deviceInputSchema.safeParse({
    serialNumber: formData.get("serialNumber"),
    branchId: formData.get("branchId"),
    label: formData.get("label") || undefined,
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  // Registering hardware at a branch is a system-level change, not a branch
  // manager's day-to-day — see device:write in authorization.ts.
  if (!can(actor, "device:write", { branchId: parsed.data.branchId })) {
    return { error: "You do not have permission to register devices at that branch." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const device = await tx.device.create({
        data: { ...parsed.data, providerType: ProviderType.FINGERPRINT },
      });
      await recordAudit(
        {
          actor: auditActorFrom(actor),
          action: "device.registered",
          entityType: "Device",
          entityId: device.id,
          after: auditSnapshot(device, AUDITED_FIELDS),
        },
        tx,
      );
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return DUPLICATE_SERIAL_ERROR;
    throw error;
  }

  revalidatePath("/admin/devices");
  return { success: true };
}

export async function updateDevice(
  deviceId: string,
  _prevState: DeviceFormState,
  formData: FormData,
): Promise<DeviceFormState> {
  const actor = await requireAuth();
  await requireMfaIfNeeded(actor);

  const existing = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!existing) return { error: "Device not found." };

  if (!can(actor, "device:write", { branchId: existing.branchId })) {
    return { error: "You do not have permission to update this device." };
  }

  const parsed = deviceUpdateSchema.safeParse({
    branchId: formData.get("branchId"),
    label: formData.get("label") || undefined,
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  // Reassigning to a different branch needs a grant over the destination
  // too — an area manager covering branch A must not move a device into a
  // branch they hold no assignment for.
  if (!can(actor, "device:write", { branchId: parsed.data.branchId })) {
    return { error: "You do not have permission to assign devices to that branch." };
  }

  await prisma.$transaction(async (tx) => {
    const after = await tx.device.update({ where: { id: deviceId }, data: parsed.data });
    await recordAudit(
      {
        actor: auditActorFrom(actor),
        action: "device.updated",
        entityType: "Device",
        entityId: deviceId,
        before: auditSnapshot(existing, AUDITED_FIELDS),
        after: auditSnapshot(after, AUDITED_FIELDS),
      },
      tx,
    );
  });

  revalidatePath("/admin/devices");
  return { success: true };
}

export async function toggleDeviceActive(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const actor = await requireAuth();
  await requireMfaIfNeeded(actor);

  const existing = await prisma.device.findUniqueOrThrow({ where: { id } });
  if (!can(actor, "device:write", { branchId: existing.branchId })) {
    throw new Error("Unauthorized to modify device");
  }

  const nextIsActive = formData.get("nextIsActive") === "true";

  await prisma.$transaction(async (tx) => {
    await tx.device.update({ where: { id }, data: { isActive: nextIsActive } });
    await recordAudit(
      {
        actor: auditActorFrom(actor),
        // A deactivated device's pushes still arrive and still get
        // acknowledged (the terminal has no way to react to a rejection) —
        // this only stops them resolving to an employee. Worth its own
        // audit verb, same reasoning as branch.activated/deactivated.
        action: nextIsActive ? "device.activated" : "device.deactivated",
        entityType: "Device",
        entityId: id,
        before: auditSnapshot(existing, AUDITED_FIELDS),
        after: auditSnapshot({ ...existing, isActive: nextIsActive }, AUDITED_FIELDS),
      },
      tx,
    );
  });

  revalidatePath("/admin/devices");
}
