import "server-only";
import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/platform/prisma";
import { getEnv } from "@/lib/platform/env";
import { scoped } from "@/lib/platform/logger";
import { enqueue } from "@/lib/platform/jobs";
import {
  createPresignedDownloadUrl,
  deleteFromStorage,
  resolveStorageUrl,
} from "@/lib/platform/r2";
import type { HostedFileDisplayMode, HostedFileItem } from "./constants";
import { isReservedSlug, SLUG_REGEX } from "./validation";
import { processLowResPreview } from "./processor";
import { FILES_PROCESS_PREVIEW } from "./jobs";

const log = scoped("modules.files.server");
const nanoid = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 8);

function formatSlugBase(title: string): string {
  const cleaned = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 32);
}

/**
 * Checks whether a proposed slug is available and valid.
 */
export async function isSlugAvailable(
  slug: string,
  excludeFileId?: string,
): Promise<{ available: boolean; reason?: string }> {
  const normalized = slug.trim().toLowerCase();

  if (!SLUG_REGEX.test(normalized)) {
    return {
      available: false,
      reason: "Slug may only contain lowercase letters, numbers, and hyphens.",
    };
  }

  if (isReservedSlug(normalized)) {
    return {
      available: false,
      reason: `"${normalized}" is a reserved system path and cannot be used.`,
    };
  }

  const existing = await prisma.hostedFile.findUnique({
    where: { slug: normalized },
    select: { id: true },
  });

  if (existing && existing.id !== excludeFileId) {
    return {
      available: false,
      reason: "This slug is already claimed by another file.",
    };
  }

  return { available: true };
}

/**
 * Generates a unique, URL-safe slug.
 */
export async function generateUniqueSlug(title?: string): Promise<string> {
  const base = title ? formatSlugBase(title) : "";
  let attempts = 0;

  while (attempts < 10) {
    const randomSuffix = nanoid();
    const candidate = base ? `${base}-${randomSuffix.slice(0, 4)}` : `file-${randomSuffix}`;

    if (!isReservedSlug(candidate)) {
      const existing = await prisma.hostedFile.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing) {
        return candidate;
      }
    }
    attempts++;
  }

  return `f-${Date.now().toString(36)}-${nanoid().slice(0, 4)}`;
}

/**
 * Retrieves a list of hosted files for the admin dashboard.
 */
export async function listHostedFiles({
  search,
  visibility,
  skip = 0,
  take = 50,
}: {
  search?: string;
  visibility?: "ALL" | "PUBLIC" | "PRIVATE";
  skip?: number;
  take?: number;
} = {}): Promise<{ files: HostedFileItem[]; total: number }> {
  const where: import("@prisma/client").Prisma.HostedFileWhereInput = {};

  if (visibility === "PUBLIC") {
    where.isPublic = true;
  } else if (visibility === "PRIVATE") {
    where.isPublic = false;
  }

  if (search && search.trim() !== "") {
    const q = search.trim();
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { originalFilename: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
    ];
  }

  const [records, total] = await Promise.all([
    prisma.hostedFile.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        uploadedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
    prisma.hostedFile.count({ where }),
  ]);

  const appUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");

  const files: HostedFileItem[] = records.map((file) => ({
    id: file.id,
    title: file.title,
    originalFilename: file.originalFilename,
    mimeType: file.mimeType,
    fileSize: file.fileSize,
    fileKey: file.fileKey,
    fileUrl: file.fileUrl,
    isPublic: file.isPublic,
    slug: file.slug,
    displayMode: file.displayMode,
    generateLowRes: file.generateLowRes,
    lowResKey: file.lowResKey,
    lowResUrl: file.lowResUrl,
    lowResSize: file.lowResSize,
    lowResStatus: file.lowResStatus,
    pageCount: file.pageCount,
    previewPages: Array.isArray(file.previewPages) ? (file.previewPages as string[]) : null,
    orientation: (file.orientation as "LANDSCAPE" | "PORTRAIT") || null,
    uploadedById: file.uploadedById,
    uploaderName: file.uploadedBy.name,
    uploaderEmail: file.uploadedBy.email,
    viewsCount: file.viewsCount,
    lastViewedAt: file.lastViewedAt,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    publicUrl: file.isPublic && file.slug ? `${appUrl}/view/${file.slug}` : null,
  }));

  return { files, total };
}

/**
 * Creates a hosted file database record and kicks off progressive preview generation.
 */
export async function createHostedFile({
  title,
  originalFilename,
  mimeType,
  fileSize,
  fileKey,
  fileUrl,
  isPublic = false,
  customSlug,
  displayMode = "IN_APP_VIEWER",
  generateLowRes = true,
  uploadedById,
}: {
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
  uploadedById: string;
}): Promise<HostedFileItem> {
  let slug: string | null = null;

  if (isPublic) {
    if (customSlug) {
      const avail = await isSlugAvailable(customSlug);
      if (!avail.available) {
        throw new Error(avail.reason ?? "Custom slug is invalid or unavailable.");
      }
      slug = customSlug.trim().toLowerCase();
    } else {
      slug = await generateUniqueSlug(title);
    }
  }

  const record = await prisma.hostedFile.create({
    data: {
      title,
      originalFilename,
      mimeType,
      fileSize,
      fileKey,
      fileUrl,
      isPublic,
      slug,
      displayMode,
      generateLowRes,
      lowResStatus: generateLowRes ? "PENDING" : "NONE",
      uploadedById,
    },
    include: {
      uploadedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  // Enqueue in Background Jobs queue so admins have visibility in /admin/jobs
  if (generateLowRes) {
    enqueue(FILES_PROCESS_PREVIEW, {
      fileId: record.id,
      title: record.title,
    }).catch((err) => {
      log.warn("Failed to enqueue files.process_preview background job", { fileId: record.id, err });
    });

    // Also trigger execution immediately in background
    processLowResPreview(record.id).catch((err) => {
      log.error("Async low-res preview generation failed", { fileId: record.id, err });
    });
  }

  const appUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");

  return {
    id: record.id,
    title: record.title,
    originalFilename: record.originalFilename,
    mimeType: record.mimeType,
    fileSize: record.fileSize,
    fileKey: record.fileKey,
    fileUrl: record.fileUrl,
    isPublic: record.isPublic,
    slug: record.slug,
    displayMode: record.displayMode,
    generateLowRes: record.generateLowRes,
    lowResKey: record.lowResKey,
    lowResUrl: record.lowResUrl,
    lowResSize: record.lowResSize,
    lowResStatus: record.lowResStatus,
    pageCount: record.pageCount,
    previewPages: Array.isArray(record.previewPages) ? (record.previewPages as string[]) : null,
    orientation: (record.orientation as "LANDSCAPE" | "PORTRAIT") || null,
    uploadedById: record.uploadedById,
    uploaderName: record.uploadedBy.name,
    uploaderEmail: record.uploadedBy.email,
    viewsCount: record.viewsCount,
    lastViewedAt: record.lastViewedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    publicUrl: record.isPublic && record.slug ? `${appUrl}/view/${record.slug}` : null,
  };
}

/**
 * Toggles a file between Public and Private.
 */
export async function toggleHostedFilePrivacy({
  fileId,
  isPublic,
  customSlug,
}: {
  fileId: string;
  isPublic: boolean;
  customSlug?: string;
}): Promise<HostedFileItem> {
  const current = await prisma.hostedFile.findUnique({
    where: { id: fileId },
    include: { uploadedBy: true },
  });

  if (!current) {
    throw new Error("File not found");
  }

  let nextSlug = current.slug;

  if (isPublic) {
    if (customSlug && customSlug.trim() !== "") {
      const avail = await isSlugAvailable(customSlug, fileId);
      if (!avail.available) {
        throw new Error(avail.reason ?? "Custom slug unavailable.");
      }
      nextSlug = customSlug.trim().toLowerCase();
    } else if (!nextSlug) {
      nextSlug = await generateUniqueSlug(current.title);
    }
  }

  const updated = await prisma.hostedFile.update({
    where: { id: fileId },
    data: {
      isPublic,
      slug: nextSlug,
    },
    include: {
      uploadedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  const appUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");

  return {
    id: updated.id,
    title: updated.title,
    originalFilename: updated.originalFilename,
    mimeType: updated.mimeType,
    fileSize: updated.fileSize,
    fileKey: updated.fileKey,
    fileUrl: updated.fileUrl,
    isPublic: updated.isPublic,
    slug: updated.slug,
    displayMode: updated.displayMode,
    generateLowRes: updated.generateLowRes,
    lowResKey: updated.lowResKey,
    lowResUrl: updated.lowResUrl,
    lowResSize: updated.lowResSize,
    lowResStatus: updated.lowResStatus,
    pageCount: updated.pageCount,
    previewPages: Array.isArray(updated.previewPages) ? (updated.previewPages as string[]) : null,
    orientation: (updated.orientation as "LANDSCAPE" | "PORTRAIT") || null,
    uploadedById: updated.uploadedById,
    uploaderName: updated.uploadedBy.name,
    uploaderEmail: updated.uploadedBy.email,
    viewsCount: updated.viewsCount,
    lastViewedAt: updated.lastViewedAt,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    publicUrl: updated.isPublic && updated.slug ? `${appUrl}/view/${updated.slug}` : null,
  };
}

/**
 * Updates a file's custom slug.
 */
export async function updateHostedFileSlug({
  fileId,
  slug,
}: {
  fileId: string;
  slug: string;
}): Promise<HostedFileItem> {
  const normalized = slug.trim().toLowerCase();
  const avail = await isSlugAvailable(normalized, fileId);
  if (!avail.available) {
    throw new Error(avail.reason ?? "Custom slug unavailable.");
  }

  const updated = await prisma.hostedFile.update({
    where: { id: fileId },
    data: { slug: normalized },
    include: {
      uploadedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  const appUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");

  return {
    id: updated.id,
    title: updated.title,
    originalFilename: updated.originalFilename,
    mimeType: updated.mimeType,
    fileSize: updated.fileSize,
    fileKey: updated.fileKey,
    fileUrl: updated.fileUrl,
    isPublic: updated.isPublic,
    slug: updated.slug,
    displayMode: updated.displayMode,
    generateLowRes: updated.generateLowRes,
    lowResKey: updated.lowResKey,
    lowResUrl: updated.lowResUrl,
    lowResSize: updated.lowResSize,
    lowResStatus: updated.lowResStatus,
    pageCount: updated.pageCount,
    previewPages: Array.isArray(updated.previewPages) ? (updated.previewPages as string[]) : null,
    orientation: (updated.orientation as "LANDSCAPE" | "PORTRAIT") || null,
    uploadedById: updated.uploadedById,
    uploaderName: updated.uploadedBy.name,
    uploaderEmail: updated.uploadedBy.email,
    viewsCount: updated.viewsCount,
    lastViewedAt: updated.lastViewedAt,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    publicUrl: updated.isPublic && updated.slug ? `${appUrl}/view/${updated.slug}` : null,
  };
}

/**
 * Updates a file's display mode (IN_APP_VIEWER vs DIRECT_RAW).
 */
export async function updateHostedFileDisplayMode({
  fileId,
  displayMode,
}: {
  fileId: string;
  displayMode: HostedFileDisplayMode;
}): Promise<HostedFileItem> {
  const updated = await prisma.hostedFile.update({
    where: { id: fileId },
    data: { displayMode },
    include: {
      uploadedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  const appUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");

  return {
    id: updated.id,
    title: updated.title,
    originalFilename: updated.originalFilename,
    mimeType: updated.mimeType,
    fileSize: updated.fileSize,
    fileKey: updated.fileKey,
    fileUrl: updated.fileUrl,
    isPublic: updated.isPublic,
    slug: updated.slug,
    displayMode: updated.displayMode,
    generateLowRes: updated.generateLowRes,
    lowResKey: updated.lowResKey,
    lowResUrl: updated.lowResUrl,
    lowResSize: updated.lowResSize,
    lowResStatus: updated.lowResStatus,
    pageCount: updated.pageCount,
    previewPages: Array.isArray(updated.previewPages) ? (updated.previewPages as string[]) : null,
    orientation: (updated.orientation as "LANDSCAPE" | "PORTRAIT") || null,
    uploadedById: updated.uploadedById,
    uploaderName: updated.uploadedBy.name,
    uploaderEmail: updated.uploadedBy.email,
    viewsCount: updated.viewsCount,
    lastViewedAt: updated.lastViewedAt,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    publicUrl: updated.isPublic && updated.slug ? `${appUrl}/view/${updated.slug}` : null,
  };
}

/**
 * Permanently deletes a file, purging original and low-res assets from object storage.
 */
export async function deleteHostedFile(fileId: string): Promise<boolean> {
  const file = await prisma.hostedFile.findUnique({
    where: { id: fileId },
  });

  if (!file) return false;

  // Purge original asset
  if (file.fileKey) {
    await deleteFromStorage(file.fileKey).catch((err) => {
      log.warn("Failed to delete original asset from storage", { fileKey: file.fileKey, err });
    });
  }

  // Purge low-res preview assets (including all pages for multi-page documents)
  if (Array.isArray(file.previewPages) && file.previewPages.length > 0) {
    for (const key of file.previewPages) {
      if (typeof key === "string") {
        await deleteFromStorage(key).catch((err) => {
          log.warn("Failed to delete preview page asset from storage", { key, err });
        });
      }
    }
  } else if (file.lowResKey) {
    await deleteFromStorage(file.lowResKey).catch((err) => {
      log.warn("Failed to delete low-res asset from storage", { lowResKey: file.lowResKey, err });
    });
  }

  await prisma.hostedFile.delete({
    where: { id: fileId },
  });

  log.info("Purged hosted file and released slug", { fileId, slug: file.slug });
  return true;
}

/**
 * Public resolver for `/view/:slug`.
 * Finds the file, checks if public, increments view counter, and resolves presigned URLs.
 */
export async function resolvePublicFileBySlug(slug: string): Promise<{
  file: HostedFileItem;
  highResResolvedUrl: string;
  lowResResolvedUrl: string | null;
  lowResPages?: string[];
} | null> {
  const normalized = slug.trim().toLowerCase();

  const file = await prisma.hostedFile.findUnique({
    where: { slug: normalized },
    include: {
      uploadedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  if (!file || !file.isPublic) {
    return null;
  }

  // Atomically increment view count
  prisma.hostedFile
    .update({
      where: { id: file.id },
      data: {
        viewsCount: { increment: 1 },
        lastViewedAt: new Date(),
      },
    })
    .catch((err) => {
      log.warn("Failed to increment view counter", { fileId: file.id, err });
    });

  const highResResolvedUrl = await resolveStorageUrl(file.fileUrl, file.fileKey);
  const lowResResolvedUrl = file.lowResUrl
    ? await resolveStorageUrl(file.lowResUrl, file.lowResKey)
    : null;

  let lowResPages: string[] | undefined = undefined;
  if (Array.isArray(file.previewPages) && file.previewPages.length > 0) {
    lowResPages = await Promise.all(
      file.previewPages.map((k) => resolveStorageUrl(k as string, k as string))
    );
  }

  const appUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");

  return {
    file: {
      id: file.id,
      title: file.title,
      originalFilename: file.originalFilename,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      fileKey: file.fileKey,
      fileUrl: file.fileUrl,
      isPublic: file.isPublic,
      slug: file.slug,
      displayMode: file.displayMode,
      generateLowRes: file.generateLowRes,
      lowResKey: file.lowResKey,
      lowResUrl: file.lowResUrl,
      lowResSize: file.lowResSize,
      lowResStatus: file.lowResStatus,
      pageCount: file.pageCount,
      previewPages: Array.isArray(file.previewPages) ? (file.previewPages as string[]) : null,
    orientation: (file.orientation as "LANDSCAPE" | "PORTRAIT") || null,
      uploadedById: file.uploadedById,
      uploaderName: file.uploadedBy.name,
      uploaderEmail: file.uploadedBy.email,
      viewsCount: file.viewsCount,
      lastViewedAt: file.lastViewedAt,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      publicUrl: `${appUrl}/view/${file.slug}`,
    },
    highResResolvedUrl,
    lowResResolvedUrl,
    lowResPages,
  };
}

/**
 * Generates an authenticated download URL for private files.
 */
export async function getPrivateDownloadUrl(fileId: string): Promise<string | null> {
  const file = await prisma.hostedFile.findUnique({
    where: { id: fileId },
  });

  if (!file) return null;

  return createPresignedDownloadUrl({
    key: file.fileKey,
    expiresInSeconds: 3600, // 1 hour
  });
}
