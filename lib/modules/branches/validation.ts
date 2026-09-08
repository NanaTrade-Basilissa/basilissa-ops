import { z } from "zod";

export const branchSlugSchema = z
  .string()
  .min(2, "Slug must be at least 2 characters")
  .max(60, "Slug must be at most 60 characters")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must contain only lowercase letters, numbers and hyphens (e.g. east-legon)",
  );

export const branchInputSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  slug: branchSlugSchema,
  location: z.string().min(2, "Location must be at least 2 characters").max(200),
  isActive: z.boolean(),
});

export type BranchInput = z.infer<typeof branchInputSchema>;
