import { NextResponse, type NextRequest } from "next/server";
import { authenticateMealRequest } from "../auth";
import { submitEmployeeMealSelections } from "@/lib/modules/meals/service";
import { submitMealSelectionSchema } from "@/lib/modules/meals/validation";

export async function POST(request: NextRequest) {
  const auth = await authenticateMealRequest(request, "meals-select");
  if (!auth.ok) {
    return auth.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON", message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = submitMealSelectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "VALIDATION_FAILED",
        message: parsed.error.issues[0]?.message || "Invalid selections payload.",
        issues: parsed.error.issues,
      },
      { status: 422 },
    );
  }

  try {
    const result = await submitEmployeeMealSelections(auth.employeeId, parsed.data.selections);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record meal selections.";
    return NextResponse.json(
      { ok: false, error: "SUBMISSION_FAILED", message },
      { status: 400 },
    );
  }
}
