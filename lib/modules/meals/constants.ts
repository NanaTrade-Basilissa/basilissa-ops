import { shiftDateKey, zonedMinutesToUtc } from "@/lib/platform/date";

export const DEFAULT_MEAL_CUTOFF_HOUR = 20; // 8:00 PM previous evening

/**
 * Calculates the exact cutoff instant for a meal on `mealDateKey`.
 * Defaults to 20:00 (8:00 PM) on the previous evening in the branch timezone.
 */
export function getMealCutoffInstant(
  mealDateKey: string,
  cutoffHour: number = DEFAULT_MEAL_CUTOFF_HOUR,
  timeZone: string = "Africa/Accra",
): Date {
  const previousDay = shiftDateKey(mealDateKey, -1);
  return zonedMinutesToUtc(previousDay, cutoffHour * 60, timeZone);
}

/**
 * Returns true if the cutoff time has passed for selecting or modifying
 * a meal choice on `mealDateKey`.
 */
export function isMealCutoffPassed(
  mealDateKey: string,
  cutoffHour: number = DEFAULT_MEAL_CUTOFF_HOUR,
  timeZone: string = "Africa/Accra",
  now: Date = new Date(),
): boolean {
  const cutoff = getMealCutoffInstant(mealDateKey, cutoffHour, timeZone);
  return now.getTime() >= cutoff.getTime();
}
