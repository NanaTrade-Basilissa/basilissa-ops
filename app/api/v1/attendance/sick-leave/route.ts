import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyDeviceToken, submitSickLeaveRequest } from "@/lib/modules/attendance/server";

const sickLeaveSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid startDate format (YYYY-MM-DD)"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid endDate format (YYYY-MM-DD)"),
  reason: z.string().min(3, "Please describe the sickness or symptoms").max(500),
  attachmentUrl: z.string().url().optional(),
  attachmentKey: z.string().optional(),
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

  const parsed = sickLeaveSchema.safeParse(body);
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
    const leaveRequest = await submitSickLeaveRequest({
      employeeId,
      ...parsed.data,
    });

    return NextResponse.json({
      ok: true,
      message: "Sick leave request submitted for manager review.",
      leaveRequest,
    });
  } catch (err) {
    console.warn("Sick leave submission error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "SUBMISSION_FAILED",
        message: err instanceof Error ? err.message : "Failed to submit sick leave request",
      },
      { status: 400 }
    );
  }
}
