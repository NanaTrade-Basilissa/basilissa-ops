import { NextResponse, type NextRequest } from "next/server";
import { verifyDeviceToken, cancelLeaveRequest } from "@/lib/modules/attendance/server";
import { rateLimit, getClientIp } from "@/lib/platform/rate-limit";

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = getClientIp(request);
  const limit = await rateLimit(`leave-cancel:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);

  if (!limit.success) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED", message: "Too many requests. Please wait a moment." },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil((limit.resetAt - Date.now()) / 1000).toString() },
      },
    );
  }

  // 1. Authenticate via Bearer header
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  const tokenVerification = verifyDeviceToken(bearerToken);
  if (!tokenVerification.ok) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED", message: tokenVerification.message },
      { status: 401 },
    );
  }

  const { employeeId } = tokenVerification.payload;

  try {
    const cancelled = await cancelLeaveRequest(employeeId, id);
    return NextResponse.json({
      ok: true,
      message: "Leave request cancelled successfully",
      leaveRequestId: cancelled.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cancel leave request";
    const status = message.includes("not authorized") ? 403 : message.includes("not found") ? 404 : 400;
    return NextResponse.json(
      {
        ok: false,
        error: "CANCELLATION_FAILED",
        message,
      },
      { status },
    );
  }
}
