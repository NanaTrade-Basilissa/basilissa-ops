import { NextResponse, type NextRequest } from "next/server";
import { verifyDeviceToken, getCycleWeeksForEmployee } from "@/lib/modules/attendance/server";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const tokenVerification = verifyDeviceToken(bearerToken);

  if (!tokenVerification.ok) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED", message: tokenVerification.message },
      { status: 401 }
    );
  }

  const { employeeId } = tokenVerification.payload;
  const url = new URL(request.url);
  const cycleId = url.searchParams.get("cycleId") || undefined;

  try {
    const data = await getCycleWeeksForEmployee(employeeId, cycleId);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("Error fetching leave cycle info:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : "Failed to load leave cycle data",
      },
      { status: 500 }
    );
  }
}
