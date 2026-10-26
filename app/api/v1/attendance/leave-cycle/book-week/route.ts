import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyDeviceToken, bookWeeklyAnnualLeave } from "@/lib/modules/attendance/server";

const bookWeekSchema = z.object({
  cycleId: z.string().min(1, "cycleId is required"),
  isoWeek: z.string().regex(/^\d{4}-W\d{2}$/, "Invalid isoWeek format (e.g. 2027-W14)"),
  reason: z.string().max(300).optional(),
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

  const parsed = bookWeekSchema.safeParse(body);
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

  const { cycleId, isoWeek, reason } = parsed.data;

  try {
    const leaveRequest = await bookWeeklyAnnualLeave({
      employeeId,
      cycleId,
      isoWeek,
      reason,
    });

    return NextResponse.json({
      ok: true,
      message: `Week ${isoWeek} successfully scheduled!`,
      leaveRequest,
    });
  } catch (err) {
    console.warn("Leave booking rejected:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "BOOKING_REJECTED",
        message: err instanceof Error ? err.message : "Failed to book annual leave week",
      },
      { status: 400 }
    );
  }
}
