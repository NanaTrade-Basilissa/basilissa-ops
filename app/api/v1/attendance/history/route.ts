import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/platform/prisma";
import { verifyDeviceToken } from "@/lib/modules/attendance/server";
import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";
import { rateLimit, getClientIp } from "@/lib/platform/rate-limit";

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function formatTime(d: Date | null): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const limitCheck = await rateLimit(`attendance-history:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);

  if (!limitCheck.success) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED", message: "Too many requests. Please wait a moment." },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil((limitCheck.resetAt - Date.now()) / 1000).toString() },
      },
    );
  }

  // 1. Authenticate via Bearer deviceToken
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : request.nextUrl.searchParams.get("deviceToken");

  const tokenVerification = verifyDeviceToken(bearerToken);
  if (!tokenVerification.ok) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED", message: tokenVerification.message },
      { status: 401 },
    );
  }

  const { employeeId } = tokenVerification.payload;

  // 2. Parse query parameters
  const searchParams = request.nextUrl.searchParams;
  const rawLimit = Number.parseInt(searchParams.get("limit") || "14", 10);
  const limit = Math.min(Math.max(Number.isNaN(rawLimit) ? 14 : rawLimit, 1), 60);

  const startDateParam = searchParams.get("startDate");
  const endDateParam = searchParams.get("endDate");

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (startDateParam && /^\d{4}-\d{2}-\d{2}$/.test(startDateParam)) {
    dateFilter.gte = new Date(`${startDateParam}T00:00:00.000Z`);
  }
  if (endDateParam && /^\d{4}-\d{2}-\d{2}$/.test(endDateParam)) {
    dateFilter.lte = new Date(`${endDateParam}T23:59:59.999Z`);
  }

  // 3. Query attendance days for this employee
  const days = await prisma.attendanceDay.findMany({
    where: {
      employeeId,
      ...(dateFilter.gte || dateFilter.lte ? { workDate: dateFilter } : {}),
    },
    orderBy: { workDate: "desc" },
    take: limit,
    select: {
      id: true,
      workDate: true,
      branchId: true,
      shiftIdSnapshot: true,
      scheduledStart: true,
      scheduledEnd: true,
      scheduledMinutes: true,
      actualIn: true,
      actualOut: true,
      grossMinutes: true,
      netWorkedMinutes: true,
      regularMinutes: true,
      overtimeMinutes: true,
      payableOvertimeMinutes: true,
      lateMinutes: true,
      earlyDepartureMinutes: true,
      status: true,
      flags: true,
    },
  });

  // 4. Branch lookup
  const branchIds = [...new Set(days.map((d) => d.branchId))];
  const branches = await prisma.branch.findMany({
    where: { id: { in: branchIds } },
    select: { id: true, name: true },
  });
  const branchMap = new Map(branches.map((b) => [b.id, b.name]));

  // 5. Aggregate summary stats
  const totalDaysWorked = days.filter((d) => d.actualIn !== null).length;
  const totalWorkedMinutes = days.reduce((acc, d) => acc + d.netWorkedMinutes, 0);
  const totalRegularMinutes = days.reduce((acc, d) => acc + d.regularMinutes, 0);
  const totalOvertimeMinutes = days.reduce((acc, d) => acc + d.overtimeMinutes, 0);
  const totalPayableOvertimeMinutes = days.reduce((acc, d) => acc + d.payableOvertimeMinutes, 0);
  const totalLateMinutes = days.reduce((acc, d) => acc + d.lateMinutes, 0);

  const formattedDays = days.map((d) => ({
    id: d.id,
    workDate: d.workDate.toISOString().slice(0, 10),
    branchId: d.branchId,
    branchName: branchMap.get(d.branchId) ?? "Unknown Branch",
    shiftName: d.shiftIdSnapshot ? "Scheduled Shift" : "Unscheduled",
    scheduledStart: formatTime(d.scheduledStart),
    scheduledEnd: formatTime(d.scheduledEnd),
    scheduledMinutes: d.scheduledMinutes,
    actualIn: d.actualIn?.toISOString() ?? null,
    actualOut: d.actualOut?.toISOString() ?? null,
    actualInTime: formatTime(d.actualIn),
    actualOutTime: formatTime(d.actualOut),
    netWorkedMinutes: d.netWorkedMinutes,
    regularMinutes: d.regularMinutes,
    overtimeMinutes: d.overtimeMinutes,
    payableOvertimeMinutes: d.payableOvertimeMinutes,
    lateMinutes: d.lateMinutes,
    earlyDepartureMinutes: d.earlyDepartureMinutes,
    status: d.status,
    flags: d.flags,
  }));

  return NextResponse.json({
    ok: true,
    summary: {
      count: formattedDays.length,
      totalDaysWorked,
      totalWorkedMinutes,
      totalRegularMinutes,
      totalOvertimeMinutes,
      totalPayableOvertimeMinutes,
      totalLateMinutes,
      totalWorkedHours: Number((totalWorkedMinutes / 60).toFixed(2)),
      totalOvertimeHours: Number((totalOvertimeMinutes / 60).toFixed(2)),
    },
    days: formattedDays,
  });
}
