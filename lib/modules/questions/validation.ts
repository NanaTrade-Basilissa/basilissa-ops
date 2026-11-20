import { z } from "zod";
import { DEFAULT_RATING_LABELS } from "@/lib/modules/feedback/constants";

export const questionInputSchema = z
  .object({
    text: z.string().trim().min(4, "Question must be at least 4 characters").max(200),
    type: z.enum(["RATING", "TEXT"]).default("RATING"),
    isRequired: z.boolean().default(true),
    isActive: z.boolean(),
    ratingLabels: z
      .array(z.string().trim().max(40, "Keep labels under 40 characters"))
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "RATING") {
      if (!data.ratingLabels || data.ratingLabels.length !== 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ratingLabels"],
          message: "All 5 rating labels are required",
        });
        return;
      }
      if (data.ratingLabels.some((label) => label.length === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ratingLabels"],
          message: "Rating labels cannot be empty",
        });
      }
    }
  })
  .transform((data) => ({
    ...data,
    // Rating questions are always required; open-ended text questions can be optional or required.
    isRequired: data.type === "RATING" ? true : data.isRequired,
    ratingLabels:
      data.type === "RATING" && data.ratingLabels && data.ratingLabels.length === 5
        ? data.ratingLabels
        : [...DEFAULT_RATING_LABELS],
  }));

export type QuestionInput = z.infer<typeof questionInputSchema>;
