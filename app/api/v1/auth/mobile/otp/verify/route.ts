import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyMobileOtp } from "@/lib/modules/attendance/server";
import { rateLimit, getClientIp } from "@/lib/platform/rate-limit";
import { scoped } from "@/lib/platform/logger";

const log = scoped("mobile-auth-verify");
const RATE_LIMIT_MAX = 25;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

const verifyOtpSchema = z
  .object({
    phone: z.string().min(8, "Phone number is required"),
    code: z.string().optional(),
    otp: z.string().optional(),
    challengeToken: z.string().optional(),
    deviceId: z.string().optional(),
    deviceName: z.string().optional(),
    platform: z.string().optional(),
  })
  .transform((data) => {
    const rawCode = (data.code || data.otp || "").trim();
    const rawDeviceId =
      data.deviceId ||
      (data.platform
        ? `device_${data.platform}_${data.phone.replace(/\D/g, "")}`
        : `device_mobile_${data.phone.replace(/\D/g, "")}`);

    return {
      phone: data.phone,
      code: rawCode,
      challengeToken: data.challengeToken || undefined,
      deviceId: rawDeviceId,
      deviceName: data.deviceName,
    };
  })
  .refine((data) => data.code.length >= 4, {
    message: "Verification code is required",
    path: ["code"],
  });

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = await rateLimit(`mobile-otp-verify:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);

  if (!limit.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "RATE_LIMITED",
        message: "Too many verification attempts. Please wait a moment before trying again.",
      },
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

  const parsed = verifyOtpSchema.safeParse(body);
  if (!parsed.success) {
    log.warn("Mobile OTP verify validation failed", {
      errors: parsed.error.issues,
      receivedKeys: body && typeof body === "object" ? Object.keys(body) : [],
    });
    return NextResponse.json(
      {
        ok: false,
        error: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid verification payload",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const result = await verifyMobileOtp(parsed.data);

  if (!result.ok) {
    const status =
      result.error === "INVALID_CODE"
        ? 401
        : result.error === "EMPLOYEE_NOT_FOUND"
          ? 404
          : result.error === "EMPLOYEE_NOT_ACTIVE"
            ? 403
            : 400;

    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result, { status: 200 });
}
