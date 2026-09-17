import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AttendanceDirection } from "@prisma/client";
import { recordMobilePunch, verifyDeviceToken } from "@/lib/modules/attendance/server";
import { rateLimit, getClientIp } from "@/lib/platform/rate-limit";
import { scoped } from "@/lib/platform/logger";

const log = scoped("attendance-punch");
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

const mobilePunchSchema = z.object({
  employeeId: z.string().optional(),
  branchId: z.string().min(1, "Branch ID is required"),
  direction: z.enum(["IN", "OUT"]),
  latitude: z.number().min(-90, "Invalid latitude").max(90, "Invalid latitude"),
  longitude: z.number().min(-180, "Invalid longitude").max(180, "Invalid longitude"),
  accuracyMeters: z.number().min(0, "Accuracy cannot be negative").max(5000, "Unrealistic accuracy"),
  isMockLocation: z.boolean().optional().default(false),
  deviceId: z.string().optional(),
  deviceToken: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = await rateLimit(`attendance-punch:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);

  if (!limit.success) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED", message: "Too many clock-in requests. Please wait a moment." },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil((limit.resetAt - Date.now()) / 1000).toString() },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON", message: "Malformed JSON payload" },
      { status: 400 },
    );
  }

  const parsed = mobilePunchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid input",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const {
    employeeId,
    branchId,
    direction,
    latitude,
    longitude,
    accuracyMeters,
    isMockLocation,
    deviceId,
    deviceToken,
    idempotencyKey,
  } = parsed.data;

  // Verify mobile device session token from Authorization header or request body
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const tokenToVerify = bearerToken || deviceToken;

  const tokenVerification = verifyDeviceToken(tokenToVerify);
  if (!tokenVerification.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "UNAUTHORIZED",
        message: tokenVerification.message,
      },
      { status: 401 },
    );
  }

  const effectiveEmployeeId = tokenVerification.payload.employeeId;
  if (employeeId && employeeId !== effectiveEmployeeId) {
    log.warn("Device token employeeId mismatch in mobile punch payload, using token identity", {
      tokenEmployeeId: effectiveEmployeeId,
      payloadEmployeeId: employeeId,
    });
  }

  const effectiveDeviceId = deviceId || tokenVerification.payload.deviceId;

  const result = await recordMobilePunch({
    employeeId: effectiveEmployeeId,
    branchId,
    direction: direction as AttendanceDirection,
    coordinates: {
      latitude,
      longitude,
      accuracyMeters,
      isMockLocation,
    },
    deviceId: effectiveDeviceId,
    idempotencyKey,
  });

  if (!result.ok) {
    log.warn("Mobile attendance punch rejected", {
      employeeId: effectiveEmployeeId,
      branchId,
      direction,
      error: result.error,
      message: result.message,
      distanceMeters: (result as any).distanceMeters,
      radiusMeters: (result as any).radiusMeters,
    });

    const status =
      result.error === "OUTSIDE_GEOFENCE" ||
      result.error === "SHIFT_ALREADY_COMPLETED" ||
      result.error === "NO_SCHEDULED_SHIFT"
        ? 422
        : result.error === "EMPLOYEE_NOT_FOUND" || result.error === "BRANCH_NOT_FOUND"
          ? 404
          : result.error === "BRANCH_NOT_ASSIGNED" || result.error === "EMPLOYEE_NOT_ACTIVE"
            ? 403
            : 400;

    return NextResponse.json(result, { status });
  }

  log.info("Mobile attendance punch recorded successfully", {
    employeeId: effectiveEmployeeId,
    branchId,
    direction,
    eventId: result.eventId,
    replayed: result.replayed,
  });

  return NextResponse.json(result, { status: 200 });
}
