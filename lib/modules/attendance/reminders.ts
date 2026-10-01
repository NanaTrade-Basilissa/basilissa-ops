import "server-only";
import { prisma } from "@/lib/platform/prisma";
import { ProviderType } from "@prisma/client";
import { dateKeyInZone } from "@/lib/platform/date";
import { scoped } from "@/lib/platform/logger";
import { sendEmployeePushNotification } from "@/lib/platform/push";
import { recordInboxNotification } from "@/lib/platform/inbox";
import { loadScheduleInputs } from "./settle";
import { resolveScheduleForDate } from "./schedule";

const log = scoped("attendance.reminders");

export type ReminderSweepSummary = {
  examined: number;
  remindersDispatched: number;
  skippedAlreadySent: number;
};

/**
 * Scans active employees with registered mobile push tokens and checks if they have
 * an upcoming scheduled shift starting in the next 15 to 60 minutes.
 * Dispatches an Expo push notification and records an audit job to prevent duplicates.
 */
export async function dispatchUpcomingShiftReminders(
  now: Date = new Date(),
  scheduleLoader = loadScheduleInputs,
): Promise<ReminderSweepSummary> {
  const employees = await prisma.employee.findMany({
    where: {
      status: "ACTIVE",
      deviceIdentities: {
        some: {
          providerType: ProviderType.MOBILE_APP,
          revokedAt: null,
        },
      },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      branchAssignments: {
        select: {
          branchId: true,
          isPrimary: true,
          branch: { select: { id: true, name: true, timezone: true } },
        },
      },
    },
  });

  let dispatched = 0;
  let skipped = 0;

  for (const emp of employees) {
    const primaryAssignment =
      emp.branchAssignments.find((b) => b.isPrimary) || emp.branchAssignments[0];
    if (!primaryAssignment?.branch) continue;

    const branch = primaryAssignment.branch;
    const timeZone = branch.timezone || "Africa/Accra";
    const todayKey = dateKeyInZone(now, timeZone);

    try {
      const inputs = await scheduleLoader(emp.id, branch.id);
      const schedule = resolveScheduleForDate(todayKey, inputs);

      if (!schedule) continue;

      const scheduledStartMs = schedule.scheduledStart.getTime();
      const nowMs = now.getTime();
      const diffMinutes = Math.round((scheduledStartMs - nowMs) / (60 * 1000));

      // Target window: shift begins within 15 to 60 minutes from now
      if (diffMinutes >= 15 && diffMinutes <= 60) {
        const dedupeKey = `shift_reminder:${emp.id}:${todayKey}:${schedule.shiftId}`;

        // Check if reminder was already recorded/sent
        const alreadySent = await prisma.job.findFirst({
          where: {
            type: "attendance:shift-reminder",
            payload: {
              path: ["dedupeKey"],
              equals: dedupeKey,
            },
          },
        });

        if (alreadySent) {
          skipped++;
          continue;
        }

        // Record job row for audit & idempotency
        await prisma.job.create({
          data: {
            type: "attendance:shift-reminder",
            status: "SUCCEEDED",
            payload: {
              dedupeKey,
              employeeId: emp.id,
              shiftId: schedule.shiftId,
              shiftName: schedule.shiftName,
              branchId: branch.id,
              branchName: branch.name,
              workDateKey: todayKey,
              dispatchedAt: now.toISOString(),
            },
            completedAt: now,
          },
        });

        const startTimeStr = schedule.scheduledStart.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone,
        });

        await sendEmployeePushNotification(emp.id, {
          title: "Upcoming Shift Reminder",
          body: `Hi ${emp.firstName}, your ${schedule.shiftName} shift at ${branch.name} starts in ${diffMinutes} minutes (${startTimeStr}).`,
          data: {
            type: "SHIFT_REMINDER",
            shiftId: schedule.shiftId,
            workDateKey: todayKey,
          },
        });
        await recordInboxNotification({
          employeeId: emp.id,
          kind: "SHIFT_REMINDER",
          title: "Upcoming Shift Reminder",
          body: `Hi ${emp.firstName}, your ${schedule.shiftName} shift at ${branch.name} starts in ${diffMinutes} minutes (${startTimeStr}).`,
          data: { type: "SHIFT_REMINDER", shiftId: schedule.shiftId, workDateKey: todayKey },
        });

        dispatched++;
      }
    } catch (err) {
      log.error("Failed to check/dispatch shift reminder", {
        employeeId: emp.id,
        error: err,
      });
    }
  }

  return {
    examined: employees.length,
    remindersDispatched: dispatched,
    skippedAlreadySent: skipped,
  };
}

export type MissedClockInSummary = {
  examined: number;
  remindersDispatched: number;
  skippedAlreadySent: number;
  skippedClockedIn: number;
};

/** Minutes after the scheduled start at which the nudge becomes due, and when it stops being useful. */
export const MISSED_CLOCK_IN_AFTER_MINUTES = 15;
export const MISSED_CLOCK_IN_UNTIL_MINUTES = 45;

/**
 * Nudges someone who has a shift today and has not clocked in 15 minutes after
 * it started.
 *
 * Runs on the server rather than the phone so it works whether or not the app
 * is open, and so it knows what the phone cannot: leave, public holidays and
 * cover shifts all resolve through `resolveScheduleForDate`, so a person who is
 * off, or whose shift was cancelled, has no schedule and is never nudged.
 *
 * "Clocked in" is the settled `AttendanceDay`, which every punch updates
 * (phone, terminal, or a manager's entry), so a fingerprint clock-in counts.
 *
 * The sweep runs every 15 minutes, so the nudge lands 15 to 30 minutes after the
 * start. Once per person per shift per day, recorded as a job row like the
 * upcoming-shift reminder; the window closes at 45 minutes, after which a nudge
 * is more noise than help.
 */
export async function dispatchMissedClockInReminders(
  now: Date = new Date(),
  scheduleLoader = loadScheduleInputs,
): Promise<MissedClockInSummary> {
  const employees = await prisma.employee.findMany({
    where: {
      status: "ACTIVE",
      deviceIdentities: { some: { providerType: ProviderType.MOBILE_APP, revokedAt: null } },
    },
    select: {
      id: true,
      firstName: true,
      branchAssignments: {
        select: {
          isPrimary: true,
          branch: { select: { id: true, name: true, timezone: true } },
        },
      },
    },
  });

  const summary: MissedClockInSummary = { examined: employees.length, remindersDispatched: 0, skippedAlreadySent: 0, skippedClockedIn: 0 };

  for (const emp of employees) {
    const primary = emp.branchAssignments.find((b) => b.isPrimary) || emp.branchAssignments[0];
    if (!primary?.branch) continue;
    const branch = primary.branch;
    const timeZone = branch.timezone || "Africa/Accra";
    const todayKey = dateKeyInZone(now, timeZone);

    try {
      const schedule = resolveScheduleForDate(todayKey, await scheduleLoader(emp.id, branch.id));
      if (!schedule) continue;

      const minutesLate = Math.round((now.getTime() - schedule.scheduledStart.getTime()) / 60_000);
      if (minutesLate < MISSED_CLOCK_IN_AFTER_MINUTES || minutesLate > MISSED_CLOCK_IN_UNTIL_MINUTES) continue;

      const clockedIn = await prisma.attendanceDay.findFirst({
        where: { employeeId: emp.id, workDate: new Date(`${todayKey}T00:00:00.000Z`), actualIn: { not: null } },
        select: { id: true },
      });
      if (clockedIn) {
        summary.skippedClockedIn++;
        continue;
      }

      const dedupeKey = `missed_clock_in:${emp.id}:${todayKey}:${schedule.shiftId}`;
      const alreadySent = await prisma.job.findFirst({
        where: { type: "attendance:missed-clock-in", payload: { path: ["dedupeKey"], equals: dedupeKey } },
        select: { id: true },
      });
      if (alreadySent) {
        summary.skippedAlreadySent++;
        continue;
      }

      await prisma.job.create({
        data: {
          type: "attendance:missed-clock-in",
          status: "SUCCEEDED",
          payload: { dedupeKey, employeeId: emp.id, shiftId: schedule.shiftId, branchId: branch.id, workDateKey: todayKey, dispatchedAt: now.toISOString() },
          completedAt: now,
        },
      });

      const startTime = schedule.scheduledStart.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
      const title = "You haven't clocked in";
      const body = `Hi ${emp.firstName}, your ${schedule.shiftName} shift at ${branch.name} started at ${startTime} and you haven't clocked in yet.`;
      const data = { type: "MISSED_CLOCK_IN", shiftId: schedule.shiftId, workDateKey: todayKey };

      await sendEmployeePushNotification(emp.id, { title, body, data });
      await recordInboxNotification({ employeeId: emp.id, kind: "SHIFT_REMINDER", title, body, data });
      summary.remindersDispatched++;
    } catch (err) {
      log.error("Failed to check/dispatch missed clock-in reminder", { employeeId: emp.id, error: err });
    }
  }

  return summary;
}
