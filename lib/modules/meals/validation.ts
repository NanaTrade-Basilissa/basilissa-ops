import { z } from "zod";

export const mealDecisionSchema = z.enum(["EATING", "NOT_EATING"]);

export const saveWeeklyMealPlanSchema = z.object({
  branchId: z.string().min(1, "Branch is required"),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD Monday"),
  days: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
      dishName: z.string().trim().max(120),
      description: z.string().trim().max(255).optional().nullable(),
      isEnabled: z.boolean().default(true),
      cutoffHour: z.number().int().min(0).max(23).default(20),
    }),
  ),
  cutoffAt: z.string().optional().nullable(),
  publish: z.boolean().default(false),
});

export const submitMealSelectionSchema = z.object({
  selections: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
      decision: mealDecisionSchema,
    }),
  ),
});

export const claimMealSchema = z.object({
  branchSlug: z.string().min(1, "Branch slug is required"),
});
