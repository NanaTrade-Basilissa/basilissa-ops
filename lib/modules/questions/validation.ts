import { z } from "zod";

export const questionInputSchema = z.object({
  text: z.string().min(4, "Question must be at least 4 characters").max(200),
  isActive: z.boolean(),
  ratingLabels: z
    .array(z.string().trim().min(1, "Label cannot be empty").max(40, "Keep labels under 40 characters"))
    .length(5, "All 5 rating labels are required"),
});

export type QuestionInput = z.infer<typeof questionInputSchema>;
