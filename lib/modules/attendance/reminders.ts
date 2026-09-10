import "server-only";
import { prisma } from "@/lib/platform/prisma";
import { ProviderType } from "@prisma/client";
import { dateKeyInZone } from "@/lib/platform/date";
import { scoped } from "@/lib/platform/logger";
import { sendEmployeePushNotification } from "@/lib/platform/push";
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
