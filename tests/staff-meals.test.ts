import { describe, expect, it } from "vitest";
import {
  getMealCutoffInstant,
  isMealCutoffPassed,
  DEFAULT_MEAL_CUTOFF_HOUR,
} from "@/lib/modules/meals/constants";
import {
  saveWeeklyMealPlanSchema,
  submitMealSelectionSchema,
  claimMealSchema,
} from "@/lib/modules/meals/validation";

describe("Staff Meals - Business Rules & Cutoffs", () => {
  const TIMEZONE = "Africa/Accra";

  it("calculates meal cutoff instant at 20:00 on the day prior to meal date", () => {
    // For a meal scheduled on Wednesday 2026-10-21:
    // Cutoff should be Tuesday 2026-10-20 at 20:00 Accra time
    const cutoff = getMealCutoffInstant("2026-10-21", 20, TIMEZONE);
    expect(cutoff.toISOString()).toBe("2026-10-20T20:00:00.000Z");
  });

  it("custom cutoff hour changes the cutoff instant correctly", () => {
    // Cutoff at 18:00 (6 PM) on previous day
    const cutoff = getMealCutoffInstant("2026-10-21", 18, TIMEZONE);
    expect(cutoff.toISOString()).toBe("2026-10-20T18:00:00.000Z");
  });

  it("identifies when cutoff has NOT passed", () => {
    // If it's Tuesday 2026-10-20 at 14:00 (before 20:00 cutoff):
    const now = new Date("2026-10-20T14:00:00.000Z");
    const passed = isMealCutoffPassed("2026-10-21", DEFAULT_MEAL_CUTOFF_HOUR, TIMEZONE, now);
    expect(passed).toBe(false);
  });

  it("identifies when cutoff HAS passed (evening before meal)", () => {
    // If it's Tuesday 2026-10-20 at 20:30 (after 20:00 cutoff):
    const now = new Date("2026-10-20T20:30:00.000Z");
    const passed = isMealCutoffPassed("2026-10-21", DEFAULT_MEAL_CUTOFF_HOUR, TIMEZONE, now);
    expect(passed).toBe(true);
  });

  it("identifies when cutoff HAS passed on the day of the meal", () => {
    // If it's Wednesday 2026-10-21 at 09:00 (morning of meal):
    const now = new Date("2026-10-21T09:00:00.000Z");
    const passed = isMealCutoffPassed("2026-10-21", DEFAULT_MEAL_CUTOFF_HOUR, TIMEZONE, now);
    expect(passed).toBe(true);
  });
});

describe("Staff Meals - Validation Schemas", () => {
  it("validates weekly meal plan schema with 7 days", () => {
    const validPayload = {
      branchId: "branch_123",
      weekStart: "2026-10-19",
      publish: true,
      days: [
        { date: "2026-10-19", dishName: "Jollof Rice & Chicken", cutoffHour: 20 },
        { date: "2026-10-20", dishName: "Waakye & Fish", cutoffHour: 20 },
        { date: "2026-10-21", dishName: "Fried Yam & Turkey", cutoffHour: 20 },
        { date: "2026-10-22", dishName: "Banku & Tilapia", cutoffHour: 20 },
        { date: "2026-10-23", dishName: "Fried Rice & Chicken", cutoffHour: 20 },
        { date: "2026-10-24", dishName: "Fufu & Goat Light Soup", cutoffHour: 20 },
        { date: "2026-10-25", dishName: "Spaghetti Bolognese", cutoffHour: 20 },
      ],
    };

    const parsed = saveWeeklyMealPlanSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid date format in meal plan", () => {
    const invalidPayload = {
      branchId: "branch_123",
      weekStart: "19-10-2026", // Invalid format
      publish: false,
      days: [],
    };

    const parsed = saveWeeklyMealPlanSchema.safeParse(invalidPayload);
    expect(parsed.success).toBe(false);
  });

  it("validates employee meal selections payload", () => {
    const validSelections = {
      selections: [
        { date: "2026-10-19", decision: "EATING" },
        { date: "2026-10-20", decision: "NOT_EATING" },
      ],
    };

    const parsed = submitMealSelectionSchema.safeParse(validSelections);
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid decision enum values", () => {
    const invalid = {
      selections: [{ date: "2026-10-19", decision: "MAYBE" }],
    };

    const parsed = submitMealSelectionSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it("validates claim meal payload with branch slug", () => {
    const valid = { branchSlug: "accra-mall" };
    const parsed = claimMealSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("validates isEnabled and cutoffAt fields on weekly meal plan schema", () => {
    const payload = {
      branchId: "branch_123",
      weekStart: "2026-10-19",
      cutoffAt: "2026-10-18T20:00:00.000Z",
      publish: true,
      days: [
        { date: "2026-10-19", dishName: "Jollof Rice", isEnabled: true, cutoffHour: 20 },
        { date: "2026-10-20", dishName: "Waakye", isEnabled: false, cutoffHour: 20 },
      ],
    };

    const parsed = saveWeeklyMealPlanSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.cutoffAt).toBe("2026-10-18T20:00:00.000Z");
      expect(parsed.data.days[0].isEnabled).toBe(true);
      expect(parsed.data.days[1].isEnabled).toBe(false);
    }
  });

  it("rejects empty branch slug", () => {
    const invalid = { branchSlug: "" };
    const parsed = claimMealSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });
});

