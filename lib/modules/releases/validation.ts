import { z } from "zod";
import { APP_PLATFORMS, UPDATE_MODES, isValidVersion } from "./version";

export const releaseInputSchema = z.object({
  platform: z.enum(APP_PLATFORMS),
  version: z
    .string()
    .trim()
    .refine(isValidVersion, "Use numbers like 1.2.0 (up to three parts, no letters)."),
  updateMode: z.enum(UPDATE_MODES),
  releaseNotes: z
    .string()
    .trim()
    .max(2000, "Keep release notes under 2000 characters.")
    .optional()
    .transform((v) => (v ? v : null)),
  /** Off by default: publishing a release must never message staff on its own. */
  sendPush: z.boolean().default(false),
});

export const multiReleaseInputSchema = z.object({
  platforms: z
    .array(z.enum(APP_PLATFORMS))
    .min(1, "Select at least one platform.")
    .transform((list) => Array.from(new Set(list))),
  version: z
    .string()
    .trim()
    .refine(isValidVersion, "Use numbers like 1.2.0 (up to three parts, no letters)."),
  updateMode: z.enum(UPDATE_MODES),
  releaseNotes: z
    .string()
    .trim()
    .max(2000, "Keep release notes under 2000 characters.")
    .optional()
    .transform((v) => (v ? v : null)),
  sendPush: z.boolean().default(false),
});

export type ReleaseInput = z.input<typeof releaseInputSchema>;
export type MultiReleaseInput = z.input<typeof multiReleaseInputSchema>;
