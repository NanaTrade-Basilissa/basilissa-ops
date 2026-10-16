import { NextResponse, type NextRequest } from "next/server";
import { authenticateMealRequest } from "./auth";
import { getEmployeeWeeklyMeals } from "@/lib/modules/meals/service";
import { dateKeyInZone, isoWeekdayInZone, shiftDateKey } from "@/lib/platform/date";
import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";

export async function GET(request: NextRequest) {
  const auth = await authenticateMealRequest(request, "meals-weekly");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const requestedWeek = request.nextUrl.searchParams.get("week");
    let weekMonday: string;

    if (requestedWeek && /^\d{4}-\d{2}-\d{2}$/.test(requestedWeek)) {
      // If client supplied any date within the week, snap to that date's Monday
      const [year, month, day] = requestedWeek.split("-").map(Number);
      const parsedDate = new Date(Date.UTC(year, month - 1, day));
      const weekday = isoWeekdayInZone(parsedDate, DISPLAY_TIMEZONE);
      weekMonday = shiftDateKey(requestedWeek, -(weekday - 1));
    } else {
      const now = new Date();
      const todayKey = dateKeyInZone(now, DISPLAY_TIMEZONE);
      const weekday = isoWeekdayInZone(now, DISPLAY_TIMEZONE);
      weekMonday = shiftDateKey(todayKey, -(weekday - 1));
    }

    const data = await getEmployeeWeeklyMeals(auth.employeeId, weekMonday);
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load meal plans.";
    return NextResponse.json(
      { ok: false, error: "MEALS_FETCH_FAILED", message },
      { status: 400 },
    );
  }
}
