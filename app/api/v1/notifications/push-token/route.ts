import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { verifyDeviceToken } from "@/lib/modules/attendance/server";
import { rateLimit, getClientIp } from "@/lib/platform/rate-limit";

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

const registerPushTokenSchema = z
  .object({
    pushToken: z.string().min(5, "Push token is required").optional(),
    expoPushToken: z.string().min(5).optional(),
    platform: z.enum(["ios", "android", "web"]).optional().default("android"),
    deviceName: z.string().max(100).optional(),
    deviceToken: z.string().optional(),
  })
  .refine((data) => Boolean(data.pushToken || data.expoPushToken), {
    message: "Push token is required",
    path: ["pushToken"],
  });

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = await rateLimit(`push-token:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);

  if (!limit.success) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED", message: "Too many attempts. Please wait a moment." },
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

  const parsed = registerPushTokenSchema.safeParse(body);
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

  const pushToken = (parsed.data.pushToken || parsed.data.expoPushToken)!;
  const { platform, deviceName, deviceToken } = parsed.data;

  // 1. Authenticate via Bearer deviceToken or payload token
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const tokenToVerify = bearerToken || deviceToken;

  const tokenVerification = verifyDeviceToken(tokenToVerify);
  if (!tokenVerification.ok) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED", message: tokenVerification.message },
      { status: 401 },
    );
  }

  const { employeeId, deviceId } = tokenVerification.payload;

  // 2. Prepare structured metadata to store in EmployeeDeviceIdentity.label
  const metadata = JSON.stringify({
    deviceName: deviceName || "Staff Mobile",
    pushToken,
    platform,
    registeredAt: new Date().toISOString(),
  });

  // 3. Upsert / update active device identity
  const existingIdentity = await prisma.employeeDeviceIdentity.findFirst({
    where: {
      employeeId,
      providerType: ProviderType.MOBILE_APP,
      externalId: deviceId,
      revokedAt: null,
    },
  });

  if (existingIdentity) {
    await prisma.employeeDeviceIdentity.update({
      where: { id: existingIdentity.id },
      data: {
        label: metadata,
      },
    });
  } else {
    await prisma.employeeDeviceIdentity.create({
      data: {
        employeeId,
        providerType: ProviderType.MOBILE_APP,
        externalId: deviceId,
        deviceId,
        label: metadata,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    message: "Push notification token registered successfully.",
  });
}
