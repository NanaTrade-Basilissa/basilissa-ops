import { z } from "zod";
import { RESERVED_SLUGS } from "./constants";

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(slug.toLowerCase());
}

export const slugSchema = z
  .string()
  .min(3, "Slug must be at least 3 characters long")
  .max(64, "Slug cannot exceed 64 characters")
  .regex(
    SLUG_REGEX,
    "Slug can only contain lowercase letters, numbers, and single hyphens (cannot start or end with a hyphen)",
  )
  .refine((val) => !isReservedSlug(val), {
    message: "This slug is reserved by the system and cannot be used",
  });

export const updateSlugSchema = z.object({
  fileId: z.string().min(1, "File ID is required"),
  slug: slugSchema,
});

export const togglePrivacySchema = z.object({
  fileId: z.string().min(1, "File ID is required"),
  isPublic: z.boolean(),
  customSlug: slugSchema.optional(),
});

export const updateDisplayModeSchema = z.object({
  fileId: z.string().min(1, "File ID is required"),
  displayMode: z.enum(["IN_APP_VIEWER", "DIRECT_RAW"]),
});

export const createFileRecordSchema = z.object({
  title: z.string().min(1, "File title is required").max(120),
  originalFilename: z.string().min(1),
  mimeType: z.string().min(1),
  fileSize: z.number().int().nonnegative(),
  fileKey: z.string().min(1),
  fileUrl: z.string().min(1),
  isPublic: z.boolean().default(false),
  customSlug: slugSchema.optional(),
  displayMode: z.enum(["IN_APP_VIEWER", "DIRECT_RAW"]).default("IN_APP_VIEWER"),
  generateLowRes: z.boolean().default(true),
});

export const hostedFileCreateSchema = createFileRecordSchema;
