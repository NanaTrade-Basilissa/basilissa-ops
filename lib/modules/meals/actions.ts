"use server";

import { revalidatePath } from "next/cache";
import { requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { saveWeeklyMealPlans, type SaveDayInput } from "./service";
import { DEFAULT_MEAL_CUTOFF_HOUR } from "./constants";

export interface MealPlanFormState {
  error?: string;
  success?: string;
}

export async function saveWeeklyMenuAction(
  _prevState: MealPlanFormState | undefined,
  formData: FormData,
): Promise<MealPlanFormState> {
  const { actor } = await requireAnyBranchPermission("meals:write");

  const branchId = formData.get("branchId") as string;
  const publish = formData.get("publish") === "true";
  const cutoffAtRaw = formData.get("cutoffAt") as string | null;
  const cutoffAt = cutoffAtRaw && cutoffAtRaw.trim() ? new Date(cutoffAtRaw.trim()) : null;

  if (!branchId) {
    return { error: "Branch is required." };
  }

  // Parse days from form data
  const days: SaveDayInput[] = [];
  for (let i = 0; i < 7; i++) {
    const date = formData.get(`days[${i}].date`) as string;
    const dishName = (formData.get(`days[${i}].dishName`) as string) ?? "";
    const description = (formData.get(`days[${i}].description`) as string) ?? "";
    const isEnabled = formData.get(`days[${i}].isEnabled`) !== "false";
    const cutoffRaw = formData.get(`days[${i}].cutoffHour`);
    const cutoffHour = cutoffRaw ? Number(cutoffRaw) : DEFAULT_MEAL_CUTOFF_HOUR;

    if (date) {
      days.push({
        date,
        dishName,
        description,
        isEnabled,
        cutoffHour,
      });
    }
  }

  try {
    await saveWeeklyMealPlans(actor, branchId, days, publish, cutoffAt);
    revalidatePath("/admin/meals");
    return {
      success: publish ? "Weekly menu published successfully!" : "Weekly menu saved as draft.",
    };
  } catch (err: any) {
    return { error: err.message || "Failed to save weekly menu." };
  }
}
