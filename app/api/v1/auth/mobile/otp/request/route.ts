import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requestMobileOtp } from "@/lib/modules/attendance/server";
import { rateLimit, getClientIp } from "@/lib/platform/rate-limit";

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const requestOtpSchema = z
  .object({
    phone: z.string().optional(),
    tel: z.string().optional(),
    name: z.string().optional(),
    email: z.string().optional(),
    code: z.string().optional(),
  })
  .refine(
    (data) =>
      Boolean(
        (data.phone && data.phone.trim().length >= 8) ||
          (data.tel && data.tel.trim().length >= 8),
      ),
    {
      message: "Valid phone number (phone or tel) is required",
      path: ["phone"],
    },
  )
  .transform((data) => ({
    phone: (data.phone || data.tel || "").trim(),
    name: data.name?.trim(),
    email: data.email?.trim(),
    code: data.code?.trim(),
  }));

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = await rateLimit(`mobile-otp-request:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);

  if (!limit.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "RATE_LIMITED",
        message: "Too many verification requests. Please wait a moment before trying again.",
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

  const parsed = requestOtpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid phone number",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { phone, name, email, code } = parsed.data;
  const result = await requestMobileOtp(phone, { name, email, code });

  if (!result.ok) {
    const status =
      result.error === "EMPLOYEE_NOT_FOUND"
        ? 404
        : result.error === "EMPLOYEE_NOT_ACTIVE"
          ? 403
          : 502;

    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result, { status: 200 });
}
