import { NextResponse, type NextRequest } from "next/server";
import { AttendanceDirection } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { verifyDeviceToken } from "@/lib/modules/attendance/server";
import { dateKeyInZone } from "@/lib/platform/date";
import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";
import { rateLimit, getClientIp } from "@/lib/platform/rate-limit";
import { resolveScheduleForDate } from "@/lib/modules/attendance/schedule";

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
  const limit = await rateLimit(`attendance-status:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);

  if (!limit.success) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED", message: "Too many requests. Please wait a moment." },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil((limit.resetAt - Date.now()) / 1000).toString() },
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

  // 2. Fetch employee details and assigned branches
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      jobTitle: true,
      status: true,
      branchAssignments: {
        where: { validTo: null },
        include: {
          branch: {
            select: {
              id: true,
              name: true,
              slug: true,
              latitude: true,
              longitude: true,
              geofenceRadiusMeters: true,
              geofenceEnabled: true,
              timezone: true,
            },
          },
        },
      },
    },
  });

  if (!employee) {
    return NextResponse.json(
      { ok: false, error: "EMPLOYEE_NOT_FOUND", message: "Employee profile not found." },
      { status: 404 },
    );
  }

  if (employee.status !== "ACTIVE") {
    return NextResponse.json(
      { ok: false, error: "EMPLOYEE_INACTIVE", message: "Employee account is not active." },
      { status: 403 },
    );
  }

  const now = new Date();
  const primaryBranch = employee.branchAssignments[0]?.branch;
  const timeZone = primaryBranch?.timezone || DISPLAY_TIMEZONE;
  const todayKey = dateKeyInZone(now, timeZone);
  const todayDate = new Date(`${todayKey}T00:00:00.000Z`);

  // 3. Fetch today's attendance day and recent punch event concurrently
  const [todayDay, lastEvent, shifts, shiftAssignments, exceptions, branchMapRecords] = await Promise.all([
    prisma.attendanceDay.findFirst({
      where: {
        employeeId,
        workDate: todayDate,
      },
    }),
    prisma.attendanceEvent.findFirst({
      where: {
        employeeId,
        supersededByEventId: null,
      },
      orderBy: { occurredAt: "desc" },
      select: {
        id: true,
        direction: true,
        occurredAt: true,
        branchId: true,
      },
    }),
    prisma.shift.findMany({
      where: { isActive: true },
      select: { id: true, name: true, startMinute: true, endMinute: true, unpaidBreakMinutes: true },
    }),
    prisma.employeeShiftAssignment.findMany({
      where: {
        employeeId,
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      select: { employeeId: true, shiftId: true, daysOfWeek: true, validFrom: true, validTo: true },
    }),
    prisma.scheduleException.findMany({
      where: {
        employeeId,
        date: todayDate,
      },
      include: { shift: true },
    }),
    prisma.branch.findMany({
      select: { id: true, name: true },
    }),
  ]);

  const branchNameLookup = new Map(branchMapRecords.map((b) => [b.id, b.name]));

  // 4. Determine current clock-in state
  const isCurrentlyIn =
    lastEvent?.direction === AttendanceDirection.IN &&
    (!todayDay || todayDay.actualOut === null);

  const currentStatus = isCurrentlyIn ? "CLOCKED_IN" : "CLOCKED_OUT";

  // 5. Resolve today's scheduled shift
  const resolvedSchedule = resolveScheduleForDate(todayKey, {
    timeZone,
    shifts,
    assignments: shiftAssignments,
    exceptions: exceptions.map((ex) => ({
      dateKey: ex.date.toISOString().slice(0, 10),
      shiftId: ex.shiftId,
      type: ex.type,
    })),
  });

  const matchingShift = resolvedSchedule
    ? shifts.find((s) => s.id === resolvedSchedule.shiftId)
    : null;
  const todayException = resolvedSchedule?.source === "exception"
    ? exceptions.find((ex) => ex.date.toISOString().slice(0, 10) === todayKey)
    : null;

  const lastPunchBranchName = lastEvent ? branchNameLookup.get(lastEvent.branchId) ?? "Unknown Branch" : null;

  return NextResponse.json({
    ok: true,
    employee: {
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      employeeCode: employee.employeeCode,
      jobTitle: employee.jobTitle,
    },
    currentStatus,
    lastPunch: lastEvent
      ? {
          eventId: lastEvent.id,
          direction: lastEvent.direction,
          occurredAt: lastEvent.occurredAt.toISOString(),
          branchId: lastEvent.branchId,
          branchName: lastPunchBranchName,
        }
      : null,
    todaySchedule: resolvedSchedule
      ? {
          shiftId: resolvedSchedule.shiftId,
          shiftName: resolvedSchedule.shiftName,
          startMinute: matchingShift?.startMinute ?? null,
          endMinute: matchingShift?.endMinute ?? null,
          startTimeFormatted: matchingShift?.startMinute !== undefined && matchingShift?.startMinute !== null
            ? `${String(Math.floor(matchingShift.startMinute / 60)).padStart(2, "0")}:${String(matchingShift.startMinute % 60).padStart(2, "0")}`
            : null,
          endTimeFormatted: matchingShift?.endMinute !== undefined && matchingShift?.endMinute !== null
            ? `${String(Math.floor(matchingShift.endMinute / 60)).padStart(2, "0")}:${String(matchingShift.endMinute % 60).padStart(2, "0")}`
            : null,
          scheduledStart: resolvedSchedule.scheduledStart.toISOString(),
          scheduledEnd: resolvedSchedule.scheduledEnd.toISOString(),
          isException: resolvedSchedule.source === "exception",
          exceptionType: todayException?.type ?? null,
        }
      : null,
    todayRecord: todayDay
      ? {
          id: todayDay.id,
          workDate: todayKey,
          branchId: todayDay.branchId,
          branchName: branchNameLookup.get(todayDay.branchId) ?? "Unknown Branch",
          actualIn: todayDay.actualIn?.toISOString() ?? null,
          actualOut: todayDay.actualOut?.toISOString() ?? null,
          actualInTime: formatTime(todayDay.actualIn),
          actualOutTime: formatTime(todayDay.actualOut),
          netWorkedMinutes: todayDay.netWorkedMinutes,
          regularMinutes: todayDay.regularMinutes,
          overtimeMinutes: todayDay.overtimeMinutes,
          lateMinutes: todayDay.lateMinutes,
          status: todayDay.status,
          flags: todayDay.flags,
        }
      : null,
    assignedBranches: employee.branchAssignments.map((ba) => ({
      id: ba.branch.id,
      name: ba.branch.name,
      slug: ba.branch.slug,
      latitude: ba.branch.latitude,
      longitude: ba.branch.longitude,
      geofenceRadiusMeters: ba.branch.geofenceRadiusMeters,
      geofenceEnabled: ba.branch.geofenceEnabled,
    })),
  });
}
