import { NextResponse, type NextRequest } from "next/server";
import { AttendanceDirection } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { verifyDeviceToken, classifyLiveFloorStatus } from "@/lib/modules/attendance/server";
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
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
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

  // 3. Fetch today's attendance day, recent punch events, corrections, schedules, and approved leaves concurrently
  const [todayDay, recentEvents, corrections, shifts, shiftAssignments, exceptions, branchMapRecords, upcomingLeaves] = await Promise.all([
    prisma.attendanceDay.findFirst({
      where: {
        employeeId,
        workDate: todayDate,
      },
    }),
    prisma.attendanceEvent.findMany({
      where: {
        employeeId,
        supersededByEventId: null,
      },
      orderBy: { occurredAt: "desc" },
      take: 10,
      select: {
        id: true,
        direction: true,
        occurredAt: true,
        branchId: true,
      },
    }),
    prisma.attendanceCorrection.findMany({
      where: {
        employeeId,
        workDate: todayDate,
        operation: "VOID_EVENT",
      },
      select: { targetEventId: true },
    }),
    prisma.shift.findMany({
      where: { isActive: true },
      select: { id: true, name: true, startMinute: true, endMinute: true, unpaidBreakMinutes: true },
    }),
    prisma.employeeShiftAssignment.findMany({
      where: {
        employeeId,
        validFrom: { lte: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000) },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      select: { employeeId: true, shiftId: true, daysOfWeek: true, validFrom: true, validTo: true },
    }),
    prisma.scheduleException.findMany({
      where: {
        employeeId,
        date: { gte: todayDate, lte: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000) },
      },
      include: { shift: true },
    }),
    prisma.branch.findMany({
      select: { id: true, name: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId,
        status: "APPROVED",
        endDate: { gte: todayDate },
      },
      select: {
        id: true,
        type: true,
        startDate: true,
        endDate: true,
      },
    }),
  ]);

  const voidedIds = new Set(
    corrections.map((c) => c.targetEventId).filter(Boolean) as string[],
  );
  // Pick the latest event that was NOT voided by a manager correction
  const lastEvent = recentEvents.find((e) => !voidedIds.has(e.id)) ?? null;

  const branchNameLookup = new Map(branchMapRecords.map((b) => [b.id, b.name]));

  // 4. Resolve today's scheduled shift
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

  // 4b. Resolve upcoming schedule for the next 7 days
  const upcomingSchedule: Array<{
    date: string;
    dayName: string;
    formattedDate: string;
    shiftId: string | null;
    shiftName: string;
    startTime: string | null;
    endTime: string | null;
    isLeave: boolean;
    leaveType: string | null;
  }> = [];

  for (let i = 1; i <= 7; i++) {
    const futureDate = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const dateKey = dateKeyInZone(futureDate, timeZone);
    const dayObj = new Date(`${dateKey}T12:00:00.000Z`);
    const dayName = i === 1 ? "Tomorrow" : dayObj.toLocaleDateString("en-US", { weekday: "short" });
    const formattedDate = dayObj.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });

    // Check if on approved leave
    const leave = (upcomingLeaves || []).find(
      (l) => dateKey >= l.startDate.toISOString().slice(0, 10) && dateKey <= l.endDate.toISOString().slice(0, 10)
    );

    if (leave) {
      upcomingSchedule.push({
        date: dateKey,
        dayName,
        formattedDate,
        shiftId: null,
        shiftName: "Approved Leave",
        startTime: null,
        endTime: null,
        isLeave: true,
        leaveType: leave.type,
      });
      continue;
    }

    const resolved = resolveScheduleForDate(dateKey, {
      timeZone,
      shifts,
      assignments: shiftAssignments,
      exceptions: exceptions.map((ex) => ({
        dateKey: ex.date.toISOString().slice(0, 10),
        shiftId: ex.shiftId,
        type: ex.type,
      })),
    });

    const shift = resolved ? shifts.find((s) => s.id === resolved.shiftId) : null;
    if (resolved && shift) {
      upcomingSchedule.push({
        date: dateKey,
        dayName,
        formattedDate,
        shiftId: shift.id,
        shiftName: resolved.shiftName || shift.name,
        startTime:
          shift.startMinute !== null
            ? `${String(Math.floor(shift.startMinute / 60)).padStart(2, "0")}:${String(shift.startMinute % 60).padStart(2, "0")}`
            : "08:00",
        endTime:
          shift.endMinute !== null
            ? `${String(Math.floor(shift.endMinute / 60)).padStart(2, "0")}:${String(shift.endMinute % 60).padStart(2, "0")}`
            : "17:00",
        isLeave: false,
        leaveType: null,
      });
    }
  }

  // 5. Determine canonical live duty state aligned identically with live floor dashboard
  const canonicalActualIn =
    todayDay?.actualIn ??
    (lastEvent &&
    lastEvent.direction === AttendanceDirection.IN &&
    dateKeyInZone(lastEvent.occurredAt, timeZone) === todayKey
      ? lastEvent.occurredAt
      : null);
  const canonicalActualOut = todayDay?.actualOut ?? null;
  const canonicalScheduledStart =
    todayDay?.scheduledStart ?? resolvedSchedule?.scheduledStart ?? null;
  const canonicalScheduledEnd =
    todayDay?.scheduledEnd ?? resolvedSchedule?.scheduledEnd ?? null;

  const { status: liveStatus } = classifyLiveFloorStatus({
    now,
    actualIn: canonicalActualIn,
    actualOut: canonicalActualOut,
    scheduledStart: canonicalScheduledStart,
    scheduledEnd: canonicalScheduledEnd,
  });

  const isCurrentlyIn = liveStatus === "ON_DUTY";
  const isCompleted = liveStatus === "COMPLETED";
  const hasSchedule = resolvedSchedule !== null;

  let canClockIn = false;
  const canClockOut = isCurrentlyIn;
  let clockInDisabledReason: "SHIFT_COMPLETED" | "NO_SHIFT_SCHEDULED" | "ALREADY_ON_DUTY" | null = null;
  let clockInDisabledMessage: string | null = null;

  if (isCurrentlyIn) {
    canClockIn = false;
    clockInDisabledReason = "ALREADY_ON_DUTY";
    clockInDisabledMessage = "You are currently on duty. Clock out when you finish your shift.";
  } else if (isCompleted) {
    canClockIn = false;
    clockInDisabledReason = "SHIFT_COMPLETED";
    clockInDisabledMessage = "Shift completed for today. See you tomorrow!";
  } else if (!hasSchedule) {
    canClockIn = false;
    clockInDisabledReason = "NO_SHIFT_SCHEDULED";
    clockInDisabledMessage = "No shift scheduled for you today. Contact your manager to be added to the rota.";
  } else {
    canClockIn = true;
    clockInDisabledReason = null;
    clockInDisabledMessage = null;
  }

  const currentStatus = isCurrentlyIn
    ? "CLOCKED_IN"
    : isCompleted
      ? "COMPLETED"
      : "CLOCKED_OUT";
  const dutyStatus = liveStatus;

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
    dutyStatus: isCurrentlyIn ? "ON_DUTY" : isCompleted ? "COMPLETED" : "OFF_DUTY",
    canClockIn,
    canClockOut,
    clockInDisabledReason,
    clockInDisabledMessage,
    todayKey,
    currentShift: matchingShift
      ? {
          id: matchingShift.id,
          name: resolvedSchedule?.shiftName || matchingShift.name,
          startTime:
            matchingShift.startMinute !== null
              ? `${String(Math.floor(matchingShift.startMinute / 60)).padStart(2, "0")}:${String(matchingShift.startMinute % 60).padStart(2, "0")}`
              : "08:00",
          endTime:
            matchingShift.endMinute !== null
              ? `${String(Math.floor(matchingShift.endMinute / 60)).padStart(2, "0")}:${String(matchingShift.endMinute % 60).padStart(2, "0")}`
              : "17:00",
          branchName: primaryBranch?.name || "",
          branchId: primaryBranch?.id || "",
        }
      : null,
    lastPunch: lastEvent
      ? {
          eventId: lastEvent.id,
          direction: lastEvent.direction,
          type: lastEvent.direction === "IN" ? "Clock In" : "Clock Out",
          occurredAt: lastEvent.occurredAt.toISOString(),
          timestamp: lastEvent.occurredAt.toISOString(),
          time: formatTime(lastEvent.occurredAt),
          occurredAtFormatted: formatTime(lastEvent.occurredAt),
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
    upcomingSchedule,
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
      isPrimary: ba.isPrimary,
    })),
  });
}
