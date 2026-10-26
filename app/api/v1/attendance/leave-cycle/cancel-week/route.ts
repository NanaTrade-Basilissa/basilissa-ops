import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyDeviceToken, cancelWeeklyAnnualLeave } from "@/lib/modules/attendance/server";

const cancelWeekSchema = z.object({
  leaveRequestId: z.string().min(1, "leaveRequestId is required"),
});

export async function POST(request: NextRequest) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON", message: "Malformed JSON payload" },
      { status: 400 }
    );
  }

  const parsed = cancelWeekSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      },
      { status: 400 }
    );
  }

  try {
    await cancelWeeklyAnnualLeave({
      employeeId,
      leaveRequestId: parsed.data.leaveRequestId,
    });

    return NextResponse.json({
      ok: true,
      message: "Leave reservation cancelled.",
    });
  } catch (err) {
    console.warn("Leave cancellation error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "CANCELLATION_FAILED",
        message: err instanceof Error ? err.message : "Failed to cancel leave",
      },
      { status: 400 }
    );
  }
}
