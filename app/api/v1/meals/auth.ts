import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/platform/prisma";
import { verifyDeviceToken } from "@/lib/modules/attendance/server";
import { rateLimit, getClientIp } from "@/lib/platform/rate-limit";

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export type MobileAuthResult =
  | { ok: true; employeeId: string }
  | { ok: false; response: NextResponse };

/**
 * Verifies mobile device token and confirms active employee status.
 */
export async function authenticateMealRequest(
  request: NextRequest,
  bucket: string = "meals",
): Promise<MobileAuthResult> {
  const ip = getClientIp(request);
  const limit = await rateLimit(`${bucket}:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!limit.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "RATE_LIMITED", message: "Too many requests. Please wait a moment." },
        { status: 429, headers: { "Retry-After": Math.ceil((limit.resetAt - Date.now()) / 1000).toString() } },
      ),
    };
  }

  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : request.nextUrl.searchParams.get("deviceToken");

  const verification = verifyDeviceToken(bearer);
  if (!verification.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "UNAUTHORIZED", message: verification.message },
        { status: 401 },
      ),
    };
  }

  const employee = await prisma.employee.findUnique({
    where: { id: verification.payload.employeeId },
    select: { id: true, status: true },
  });

  if (!employee || employee.status !== "ACTIVE") {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "EMPLOYEE_NOT_ACTIVE", message: "Employee account is not active." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, employeeId: employee.id };
}
