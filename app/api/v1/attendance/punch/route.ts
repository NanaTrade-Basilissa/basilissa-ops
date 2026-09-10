import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AttendanceDirection } from "@prisma/client";
import { recordMobilePunch } from "@/lib/modules/attendance/server";
import { rateLimit, getClientIp } from "@/lib/platform/rate-limit";

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export const mobilePunchSchema = z.object({
  employeeId: z.string().min(1, "Employee ID is required"),
  branchId: z.string().min(1, "Branch ID is required"),
  direction: z.enum(["IN", "OUT"]),
  latitude: z.number().min(-90, "Invalid latitude").max(90, "Invalid latitude"),
  longitude: z.number().min(-180, "Invalid longitude").max(180, "Invalid longitude"),
  accuracyMeters: z.number().min(0, "Accuracy cannot be negative").max(5000, "Unrealistic accuracy"),
  isMockLocation: z.boolean().optional().default(false),
  deviceId: z.string().optional(),
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
    idempotencyKey,
  } = parsed.data;

  const result = await recordMobilePunch({
    employeeId,
    branchId,
    direction: direction as AttendanceDirection,
    coordinates: {
      latitude,
      longitude,
      accuracyMeters,
      isMockLocation,
    },
    deviceId,
    idempotencyKey,
  });

  if (!result.ok) {
    const status =
      result.error === "OUTSIDE_GEOFENCE"
        ? 422
        : result.error === "EMPLOYEE_NOT_FOUND" || result.error === "BRANCH_NOT_FOUND"
          ? 404
          : result.error === "BRANCH_NOT_ASSIGNED" || result.error === "EMPLOYEE_NOT_ACTIVE"
            ? 403
            : 400;

    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result, { status: 200 });
}
