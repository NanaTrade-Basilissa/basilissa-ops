import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  verifyDeviceToken,
  submitLeaveRequest,
  getEmployeeLeaveRequests,
} from "@/lib/modules/attendance/server";
import { rateLimit, getClientIp } from "@/lib/platform/rate-limit";
import { LeaveType } from "@prisma/client";

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

const createLeaveRequestSchema = z
  .object({
    type: z.nativeEnum(LeaveType).optional(),
    leaveType: z.nativeEnum(LeaveType).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid startDate format (YYYY-MM-DD)"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid endDate format (YYYY-MM-DD)"),
    reason: z.string().max(500, "Reason is too long").optional().default("Personal Leave"),
    branchId: z.string().optional(),
    deviceToken: z.string().optional(),
  })
  .refine((data) => Boolean(data.type || data.leaveType), {
    message: "Leave type is required",
    path: ["type"],
  });

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = await rateLimit(`leave-post:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);

  if (!limit.success) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED", message: "Too many requests. Please wait a moment." },
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

  // 1. Authenticate via Bearer or body token first
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
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

  // 2. Validate payload
  const parsed = createLeaveRequestSchema.safeParse(body);
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

  const resolvedType = (parsed.data.type || parsed.data.leaveType)!;
  const { startDate, endDate, reason, branchId } = parsed.data;
  const { employeeId } = tokenVerification.payload;

  try {
    const leaveRequest = await submitLeaveRequest({
      employeeId,
      type: resolvedType,
      startDate,
      endDate,
      reason,
      branchId,
    });

    return NextResponse.json(
      {
        ok: true,
        leaveRequest: {
          id: leaveRequest.id,
          type: leaveRequest.type,
          leaveType: leaveRequest.type,
          startDate: leaveRequest.startDate.toISOString().slice(0, 10),
          endDate: leaveRequest.endDate.toISOString().slice(0, 10),
          reason: leaveRequest.reason,
          status: leaveRequest.status,
          branchName: leaveRequest.branch?.name ?? null,
          createdAt: leaveRequest.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "SUBMISSION_FAILED",
        message: error instanceof Error ? error.message : "Failed to submit leave request",
      },
      { status: 400 },
    );
  }
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = await rateLimit(`leave-get:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);

  if (!limit.success) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED", message: "Too many requests. Please wait a moment." },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil((limit.resetAt - Date.now()) / 1000).toString() },
      },
    );
  }

  // 1. Authenticate via Bearer
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
  const searchParams = request.nextUrl.searchParams;
  const take = Math.min(Math.max(Number(searchParams.get("limit") || 50), 1), 100);
  const skip = Math.max(Number(searchParams.get("offset") || 0), 0);

  const { requests, total } = await getEmployeeLeaveRequests(employeeId, take, skip);

  return NextResponse.json({
    ok: true,
    total,
    leaveRequests: requests.map((r) => ({
      id: r.id,
      type: r.type,
      leaveType: r.type,
      startDate: r.startDate.toISOString().slice(0, 10),
      endDate: r.endDate.toISOString().slice(0, 10),
      reason: r.reason,
      status: r.status,
      branchName: r.branch?.name ?? null,
      reviewedBy: r.reviewer?.name ?? null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      managerNotes: r.managerNotes,
      reviewNotes: r.managerNotes ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
