import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { recordMobilePunch, verifyDeviceToken } from "@/lib/modules/attendance/server";
import { rateLimit, getClientIp } from "@/lib/platform/rate-limit";
import { scoped } from "@/lib/platform/logger";

const log = scoped("attendance-punch-sync");
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

const syncPunchItemSchema = z.object({
  clientPunchId: z.string().min(1, "clientPunchId is required"),
  branchId: z.string().min(1, "branchId is required"),
  direction: z.enum(["IN", "OUT"]),
  occurredAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid occurredAt ISO timestamp"),
  latitude: z.number().min(-90, "Invalid latitude").max(90, "Invalid latitude"),
  longitude: z.number().min(-180, "Invalid longitude").max(180, "Invalid longitude"),
  accuracyMeters: z.number().min(0).max(5000, "Unrealistic accuracy"),
  isMockLocation: z.boolean().optional().default(false),
});

const syncPayloadSchema = z.object({
  deviceToken: z.string().optional(),
  deviceId: z.string().optional(),
  punches: z.array(syncPunchItemSchema).min(1, "At least one punch is required").max(50, "Max 50 punches per batch"),
});

export type SyncPunchItemResult = {
  clientPunchId: string;
  status: "ACCEPTED" | "DUPLICATE" | "REJECTED";
  direction: "IN" | "OUT";
  eventId?: string;
  workDateKey?: string;
  distanceMeters?: number | null;
  error?: string;
  message?: string;
  flags?: string[];
};

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = await rateLimit(`punch-sync:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);

  if (!limit.success) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED", message: "Too many sync attempts. Please wait a moment." },
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

  // 1. Authenticate via Bearer deviceToken or body token first
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const bodyToken =
    body && typeof body === "object" && "deviceToken" in body && typeof (body as { deviceToken?: unknown }).deviceToken === "string"
      ? (body as { deviceToken: string }).deviceToken
      : null;
  const tokenToVerify = bearerToken || bodyToken;

  const tokenVerification = verifyDeviceToken(tokenToVerify);
  if (!tokenVerification.ok) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED", message: tokenVerification.message },
      { status: 401 },
    );
  }

  const parsed = syncPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Invalid sync payload",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { punches, deviceId } = parsed.data;
  const { employeeId, deviceId: tokenDeviceId } = tokenVerification.payload;
  const effectiveDeviceId = tokenDeviceId || deviceId || "mobile-client";

  // 2. Sort punches chronologically by occurredAt to ensure orderly ingest
  const sortedPunches = [...punches].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );

  const results: SyncPunchItemResult[] = [];
  let acceptedCount = 0;
  let duplicateCount = 0;
  let rejectedCount = 0;

  // 3. Process each offline punch sequentially
  for (const p of sortedPunches) {
    const idempotencyKey = `mobile-offline:${effectiveDeviceId}:${p.clientPunchId}`;

    const punchResult = await recordMobilePunch({
      employeeId,
      branchId: p.branchId,
      direction: p.direction,
      coordinates: {
        latitude: p.latitude,
        longitude: p.longitude,
        accuracyMeters: p.accuracyMeters,
        isMockLocation: p.isMockLocation,
      },
      deviceId: effectiveDeviceId,
      idempotencyKey,
      occurredAt: new Date(p.occurredAt),
      isOffline: true,
    });

    if (punchResult.ok) {
      if (punchResult.replayed) {
        duplicateCount++;
        results.push({
          clientPunchId: p.clientPunchId,
          status: "DUPLICATE",
          direction: p.direction,
          eventId: punchResult.eventId,
          workDateKey: punchResult.workDateKey,
          distanceMeters: punchResult.distanceMeters,
          flags: punchResult.flags,
          message: "Punch was previously ingested.",
        });
      } else {
        acceptedCount++;
        results.push({
          clientPunchId: p.clientPunchId,
          status: "ACCEPTED",
          direction: p.direction,
          eventId: punchResult.eventId,
          workDateKey: punchResult.workDateKey,
          distanceMeters: punchResult.distanceMeters,
          flags: punchResult.flags,
        });
      }
    } else {
      rejectedCount++;
      results.push({
        clientPunchId: p.clientPunchId,
        status: "REJECTED",
        direction: p.direction,
        error: punchResult.error,
        message: punchResult.message,
        distanceMeters: punchResult.distanceMeters,
      });
    }
  }

  log.info("Mobile offline batch sync processed", {
    employeeId,
    total: sortedPunches.length,
    accepted: acceptedCount,
    duplicates: duplicateCount,
    rejected: rejectedCount,
    results: results.map((r) => ({
      id: r.clientPunchId,
      status: r.status,
      error: r.error,
      msg: r.message,
    })),
  });

  return NextResponse.json({
    ok: true,
    total: sortedPunches.length,
    accepted: acceptedCount,
    duplicates: duplicateCount,
    rejected: rejectedCount,
    results,
  });
}
