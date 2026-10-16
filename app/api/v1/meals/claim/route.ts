import { NextResponse, type NextRequest } from "next/server";
import { authenticateMealRequest } from "../auth";
import { claimMealByWallScan } from "@/lib/modules/meals/service";
import { claimMealSchema } from "@/lib/modules/meals/validation";

export async function POST(request: NextRequest) {
  const auth = await authenticateMealRequest(request, "meals-claim");
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

  const parsed = claimMealSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "VALIDATION_FAILED",
        message: parsed.error.issues[0]?.message || "Invalid claim payload.",
      },
      { status: 422 },
    );
  }

  try {
    const result = await claimMealByWallScan(auth.employeeId, parsed.data.branchSlug);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process meal claim.";
    return NextResponse.json(
      { ok: false, error: "CLAIM_FAILED", message },
      { status: 500 },
    );
  }
}
