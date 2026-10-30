"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/platform/prisma";
import { enqueue } from "@/lib/platform/jobs";
import { requirePermission } from "@/lib/modules/identity/server";
import type { HostedFileDisplayMode, HostedFileItem } from "./constants";
import {
  createHostedFile,
  deleteHostedFile,
  getPrivateDownloadUrl,
  isSlugAvailable,
  toggleHostedFilePrivacy,
  updateHostedFileDisplayMode,
  updateHostedFileSlug,
} from "./server";
import { processLowResPreview } from "./processor";
import { FILES_PROCESS_PREVIEW } from "./jobs";
import { hostedFileCreateSchema, updateSlugSchema } from "./validation";

export type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Checks whether a proposed slug is available and valid.
 */
export async function checkSlugAvailabilityAction(
  slug: string,
  excludeFileId?: string,
): Promise<{ available: boolean; reason?: string }> {
  await requirePermission("files:read");
  return isSlugAvailable(slug, excludeFileId);
}

/**
 * Creates a hosted file record after direct client upload or server upload.
 */
export async function createHostedFileAction(input: {
  title: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  fileKey: string;
  fileUrl: string;
  isPublic?: boolean;
  customSlug?: string;
  displayMode?: HostedFileDisplayMode;
  generateLowRes?: boolean;
}): Promise<ActionResult<HostedFileItem>> {
  try {
    const actor = await requirePermission("files:write");
    const parsed = hostedFileCreateSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid file input data.",
      };
    }

    const file = await createHostedFile({
      ...parsed.data,
      uploadedById: actor.userId,
    });

    revalidatePath("/admin/files");
    return { success: true, data: file };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create hosted file.",
    };
  }
}

/**
 * Toggles a hosted file between Public and Private.
 */
export async function toggleFilePrivacyAction(input: {
  fileId: string;
  isPublic: boolean;
  customSlug?: string;
}): Promise<ActionResult<HostedFileItem>> {
  try {
    await requirePermission("files:write");
    const file = await toggleHostedFilePrivacy({
      fileId: input.fileId,
      isPublic: input.isPublic,
      customSlug: input.customSlug,
    });

    revalidatePath("/admin/files");
    if (file.slug) {
      revalidatePath(`/view/${file.slug}`);
    }
    return { success: true, data: file };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to toggle file privacy.",
    };
  }
}

/**
 * Updates a file's public custom vanity slug.
 */
export async function updateFileSlugAction(input: {
  fileId: string;
  slug: string;
}): Promise<ActionResult<HostedFileItem>> {
  try {
    await requirePermission("files:write");
    const parsed = updateSlugSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid slug format.",
      };
    }

    const file = await updateHostedFileSlug({
      fileId: parsed.data.fileId,
      slug: parsed.data.slug,
    });

    revalidatePath("/admin/files");
    revalidatePath(`/view/${file.slug}`);
    return { success: true, data: file };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update custom slug.",
    };
  }
}

/**
 * Updates a file's public display mode (IN_APP_VIEWER vs DIRECT_RAW).
 */
export async function updateFileDisplayModeAction(input: {
  fileId: string;
  displayMode: HostedFileDisplayMode;
}): Promise<ActionResult<HostedFileItem>> {
  try {
    await requirePermission("files:write");
    const file = await updateHostedFileDisplayMode(input);

    revalidatePath("/admin/files");
    if (file.slug) {
      revalidatePath(`/view/${file.slug}`);
    }
    return { success: true, data: file };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update display mode.",
    };
  }
}

/**
 * Retrigger low-res preview generation for a file.
 */
export async function regenerateLowResAction(fileId: string): Promise<ActionResult<{ queued: boolean }>> {
  try {
    await requirePermission("files:write");
    const file = await prisma.hostedFile.findUnique({
      where: { id: fileId },
      select: { id: true, title: true },
    });

    if (!file) {
      return { success: false, error: "File not found" };
    }

    await prisma.hostedFile.update({
      where: { id: fileId },
      data: { lowResStatus: "PENDING" },
    });

    enqueue(FILES_PROCESS_PREVIEW, {
      fileId: file.id,
      title: file.title,
    }).catch(() => {});

    // Run asynchronously
    processLowResPreview(fileId).catch(() => {});
    revalidatePath("/admin/files");
    return { success: true, data: { queued: true } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to trigger preview generation.",
    };
  }
}

/**
 * Permanently deletes a file, removing assets from S3/R2 and releasing any vanity slug.
 */
export async function deleteHostedFileAction(fileId: string): Promise<ActionResult<{ deleted: boolean }>> {
  try {
    await requirePermission("files:write");
    const ok = await deleteHostedFile(fileId);
    revalidatePath("/admin/files");
    return { success: true, data: { deleted: ok } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete file.",
    };
  }
}

/**
 * Retrieves a secure, time-limited presigned URL for private file download.
 */
export async function getPrivateDownloadUrlAction(fileId: string): Promise<ActionResult<string>> {
  try {
    await requirePermission("files:read");
    const url = await getPrivateDownloadUrl(fileId);
    if (!url) {
      return { success: false, error: "File not found or storage key missing." };
    }
    return { success: true, data: url };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate download URL.",
    };
  }
}
