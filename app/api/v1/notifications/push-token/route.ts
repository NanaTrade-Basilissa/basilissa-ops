import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { verifyDeviceToken } from "@/lib/modules/attendance/server";
import { rateLimit, getClientIp } from "@/lib/platform/rate-limit";
import { parseDeviceMetadata } from "@/lib/platform/push";

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

  // 2. Find the active identity for this install, if any.
  const existingIdentity = await prisma.employeeDeviceIdentity.findFirst({
    where: {
      employeeId,
      providerType: ProviderType.MOBILE_APP,
      externalId: deviceId,
      revokedAt: null,
    },
  });

  // 3. Prepare structured metadata to store in EmployeeDeviceIdentity.label.
  //
  // KEEP THE NAME ALREADY ON RECORD. The label starts life as the phone's real
  // model ("TECNO KM5", "iPhone"), recorded at sign-in, and the app registers
  // its token under a generic "iOS Staff Device". Letting that overwrite the
  // model would leave admins unable to tell devices apart on the Devices screen.
  const knownName = parseDeviceMetadata(existingIdentity?.label ?? null).deviceName;
  const metadata = JSON.stringify({
    deviceName: knownName || deviceName || "Staff Mobile",
    pushToken,
    platform,
    registeredAt: new Date().toISOString(),
  });

  // 4. Update the active device identity, or create one.
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

/**
 * DELETE /api/v1/notifications/push-token: the app calls this on sign-out, so the
 * phone stops receiving this person's notifications.
 *
 * ONLY THE TOKEN GOES. The device binding stays: signing out is not releasing the
 * phone (a manager does that), and the one-phone-per-person rule must hold across
 * sign-outs. The device name is kept; the label just loses its token. Idempotent:
 * a phone with no registered token is already as asked.
 */
export async function DELETE(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = await rateLimit(`push-token-clear:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!limit.success) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED", message: "Too many attempts. Please wait a moment." },
      { status: 429, headers: { "Retry-After": Math.ceil((limit.resetAt - Date.now()) / 1000).toString() } },
    );
  }

  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const verification = verifyDeviceToken(bearerToken);
  if (!verification.ok) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED", message: verification.message }, { status: 401 });
  }

  const { employeeId, deviceId } = verification.payload;
  const identity = await prisma.employeeDeviceIdentity.findFirst({
    where: { employeeId, providerType: ProviderType.MOBILE_APP, externalId: deviceId, revokedAt: null },
  });

  if (identity) {
    const { deviceName, platform } = parseDeviceMetadata(identity.label);
    // Back to a plain name when there is one, exactly as it was before the app registered.
    const label = deviceName ?? (platform ? JSON.stringify({ platform }) : null);
    await prisma.employeeDeviceIdentity.update({ where: { id: identity.id }, data: { label } });
  }

  return NextResponse.json({ ok: true });
}
