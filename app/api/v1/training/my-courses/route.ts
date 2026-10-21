import { NextResponse, type NextRequest } from "next/server";
import { authenticateTrainingMobileRequest } from "../auth";
import { getEmployeeCourses } from "@/lib/modules/training/queries";

export async function GET(request: NextRequest) {
  const auth = await authenticateTrainingMobileRequest(request, "training-my-courses");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const courses = await getEmployeeCourses(auth.employeeId);
    return NextResponse.json({ ok: true, courses });
  } catch (error) {
    console.error("Failed to load employee courses:", error);
    return NextResponse.json(
      { ok: false, error: "TRAINING_FETCH_FAILED", message: "Failed to load assigned training courses." },
      { status: 500 }
    );
  }
}
