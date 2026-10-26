import "server-only";
import { prisma } from "@/lib/platform/prisma";
import { ProviderType, NotificationKind } from "@prisma/client";
import { dateKeyInZone } from "@/lib/platform/date";
import { scoped } from "@/lib/platform/logger";
import { sendEmployeePushNotification } from "@/lib/platform/push";
import { recordInboxNotification } from "@/lib/platform/inbox";

const log = scoped("attendance.leave-reminders");

export type LeaveReminderSummary = {
  upcoming14dDispatched: number;
  upcoming3dDispatched: number;
  activeTodayDispatched: number;
  returnTomorrowDispatched: number;
  windowCountdownDispatched: number;
};

/**
 * Sweeps for upcoming approved leaves, day-1 active leaves, return-to-work reminders,
 * and annual planning window deadlines.
 */
export async function dispatchAllLeaveLifecycleReminders(
  now: Date = new Date()
): Promise<LeaveReminderSummary> {
  const summary: LeaveReminderSummary = {
    upcoming14dDispatched: 0,
    upcoming3dDispatched: 0,
    activeTodayDispatched: 0,
    returnTomorrowDispatched: 0,
    windowCountdownDispatched: 0,
  };

  try {
    // 1. Upcoming & Active Leaves
    await sweepLeaveUpcomingAndReturn(now, summary);
  } catch (err) {
    log.error("Failed during upcoming/return leave sweep", { err });
  }

  try {
    // 2. Annual Window Countdown
    await sweepAnnualWindowCountdown(now, summary);
  } catch (err) {
    log.error("Failed during annual window countdown sweep", { err });
  }

  return summary;
}

/**
 * Checks approved leaves for T-14d, T-3d, Day 1, and Return Tomorrow (T-1d before return)
 */
async function sweepLeaveUpcomingAndReturn(
  now: Date,
  summary: LeaveReminderSummary
): Promise<void> {
  // Query approved leaves starting within 16 days or ending today
  const activeAndUpcomingLeaves = await prisma.leaveRequest.findMany({
    where: {
      status: "APPROVED",
      endDate: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          status: true,
          branchAssignments: {
            select: {
              isPrimary: true,
              branch: { select: { id: true, name: true, timezone: true } },
            },
          },
          deviceIdentities: {
            where: {
              providerType: ProviderType.MOBILE_APP,
              revokedAt: null,
            },
            select: { id: true },
          },
        },
      },
    },
  });

  for (const req of activeAndUpcomingLeaves) {
    const emp = req.employee;
    if (emp.status !== "ACTIVE" || emp.deviceIdentities.length === 0) continue;

    const primaryBranch =
      emp.branchAssignments.find((b) => b.isPrimary)?.branch ||
      emp.branchAssignments[0]?.branch;
    const timeZone = primaryBranch?.timezone || "Africa/Accra";
    const todayKey = dateKeyInZone(now, timeZone);

    const startKey = req.startDate.toISOString().split("T")[0];
    const endKey = req.endDate.toISOString().split("T")[0];

    const startDateMs = new Date(`${startKey}T00:00:00.000Z`).getTime();
    const todayMs = new Date(`${todayKey}T00:00:00.000Z`).getTime();
    const diffDays = Math.round((startDateMs - todayMs) / (24 * 60 * 60 * 1000));

    const formattedStart = req.startDate.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone,
    });
    const formattedEnd = req.endDate.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone,
    });

    // ---------------------------------------------------------
    // A. UPCOMING: T-14 DAYS (2 WEEKS)
    // ---------------------------------------------------------
    if (diffDays === 14) {
      const dedupeKey = `leave_reminder_14d:${req.id}`;
      const alreadySent = await checkJobDedupe(dedupeKey);

      if (!alreadySent) {
        await recordJobDedupe(dedupeKey, {
          leaveRequestId: req.id,
          employeeId: emp.id,
          type: "LEAVE_14D_REMINDER",
        }, now);

        const title = "Upcoming Leave in 2 Weeks";
        const body = `Hi ${emp.firstName}, your leave starts in 2 weeks on ${formattedStart}. Please coordinate any task handover with your branch supervisor.`;

        await sendEmployeePushNotification(emp.id, {
          title,
          body,
          data: { type: "LEAVE_UPCOMING", leaveRequestId: req.id, daysUntil: 14 },
        });

        await recordInboxNotification({
          employeeId: emp.id,
          kind: NotificationKind.LEAVE_DECISION,
          title,
          body,
          data: { type: "LEAVE_UPCOMING", leaveRequestId: req.id, daysUntil: 14 },
        });

        summary.upcoming14dDispatched++;
      }
    }

    // ---------------------------------------------------------
    // B. UPCOMING: T-3 DAYS
    // ---------------------------------------------------------
    if (diffDays === 3) {
      const dedupeKey = `leave_reminder_3d:${req.id}`;
      const alreadySent = await checkJobDedupe(dedupeKey);

      if (!alreadySent) {
        await recordJobDedupe(dedupeKey, {
          leaveRequestId: req.id,
          employeeId: emp.id,
          type: "LEAVE_3D_REMINDER",
        }, now);

        const title = "Leave Starting Soon (3 Days)";
        const body = `Hi ${emp.firstName}, your leave begins in 3 days on ${formattedStart}. Wishing you a restful and refreshing break!`;

        await sendEmployeePushNotification(emp.id, {
          title,
          body,
          data: { type: "LEAVE_UPCOMING", leaveRequestId: req.id, daysUntil: 3 },
        });

        await recordInboxNotification({
          employeeId: emp.id,
          kind: NotificationKind.LEAVE_DECISION,
          title,
          body,
          data: { type: "LEAVE_UPCOMING", leaveRequestId: req.id, daysUntil: 3 },
        });

        summary.upcoming3dDispatched++;
      }
    }

    // ---------------------------------------------------------
    // C. DAY 1: LEAVE ACTIVE TODAY
    // ---------------------------------------------------------
    if (startKey === todayKey) {
      const dedupeKey = `leave_active_today:${req.id}:${todayKey}`;
      const alreadySent = await checkJobDedupe(dedupeKey);

      if (!alreadySent) {
        await recordJobDedupe(dedupeKey, {
          leaveRequestId: req.id,
          employeeId: emp.id,
          type: "LEAVE_ACTIVE_TODAY",
        }, now);

        const title = "Leave Active: Enjoy Your Break";
        const body = `Hi ${emp.firstName}, your leave is officially active today through ${formattedEnd}. Enjoy your well-deserved break!`;

        await sendEmployeePushNotification(emp.id, {
          title,
          body,
          data: { type: "LEAVE_ACTIVE", leaveRequestId: req.id },
        });

        await recordInboxNotification({
          employeeId: emp.id,
          kind: NotificationKind.LEAVE_DECISION,
          title,
          body,
          data: { type: "LEAVE_ACTIVE", leaveRequestId: req.id },
        });

        summary.activeTodayDispatched++;
      }
    }

    // ---------------------------------------------------------
    // D. RETURN TO WORK REMINDER: LEAVE ENDS TODAY
    // ---------------------------------------------------------
    if (endKey === todayKey) {
      const dedupeKey = `leave_return_tomorrow:${req.id}:${todayKey}`;
      const alreadySent = await checkJobDedupe(dedupeKey);

      if (!alreadySent) {
        await recordJobDedupe(dedupeKey, {
          leaveRequestId: req.id,
          employeeId: emp.id,
          type: "LEAVE_RETURN_TOMORROW",
        }, now);

        const title = "Leave Concludes Today";
        const body = `Hi ${emp.firstName}, your leave concludes today. We look forward to having you back tomorrow! Please check your roster on the app for your next shift.`;

        await sendEmployeePushNotification(emp.id, {
          title,
          body,
          data: { type: "LEAVE_RETURN", leaveRequestId: req.id },
        });

        await recordInboxNotification({
          employeeId: emp.id,
          kind: NotificationKind.LEAVE_DECISION,
          title,
          body,
          data: { type: "LEAVE_RETURN", leaveRequestId: req.id },
        });

        summary.returnTomorrowDispatched++;
      }
    }
  }
}

/**
 * Checks for open annual selection window countdowns (e.g. 14, 7, 3, 1 days remaining)
 */
async function sweepAnnualWindowCountdown(
  now: Date,
  summary: LeaveReminderSummary
): Promise<void> {
  const openCycle = await prisma.leaveCycle.findFirst({
    where: {
      status: "OPEN",
      windowStart: { lte: now },
      windowEnd: { gte: now },
    },
  });

  if (!openCycle) return;

  const msRemaining = openCycle.windowEnd.getTime() - now.getTime();
  const daysRemaining = Math.max(1, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));

  // Target specific countdown days
  if (![14, 7, 3, 1].includes(daysRemaining)) return;

  // Find employees who still have unscheduled days in this cycle
  const allocations = await prisma.leaveAllocation.findMany({
    where: {
      cycleId: openCycle.id,
      isEligible: true,
      scheduledDays: { lt: 15 },
    },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          status: true,
          deviceIdentities: {
            where: {
              providerType: ProviderType.MOBILE_APP,
              revokedAt: null,
            },
            select: { id: true },
          },
        },
      },
    },
  });

  for (const alloc of allocations) {
    const emp = alloc.employee;
    if (emp.status !== "ACTIVE" || emp.deviceIdentities.length === 0) continue;

    const dedupeKey = `leave_window_countdown:${openCycle.id}:${emp.id}:${daysRemaining}d`;
    const alreadySent = await checkJobDedupe(dedupeKey);
    if (alreadySent) continue;

    await recordJobDedupe(dedupeKey, {
      cycleId: openCycle.id,
      employeeId: emp.id,
      daysRemaining,
    }, now);

    const title = `Annual Leave Window Closing (${daysRemaining} day${daysRemaining > 1 ? "s" : ""})`;
    const body = `Hi ${emp.firstName}, you have scheduled ${alloc.scheduledDays} of ${alloc.entitledDays} days for ${openCycle.year}. Please select your preferred weeks before the window closes.`;

    await sendEmployeePushNotification(emp.id, {
      title,
      body,
      data: { type: "ANNUAL_WINDOW_COUNTDOWN", cycleId: openCycle.id, daysRemaining },
    });

    await recordInboxNotification({
      employeeId: emp.id,
      kind: NotificationKind.LEAVE_DECISION,
      title,
      body,
      data: { type: "ANNUAL_WINDOW_COUNTDOWN", cycleId: openCycle.id, daysRemaining },
    });

    summary.windowCountdownDispatched++;
  }
}

async function checkJobDedupe(dedupeKey: string): Promise<boolean> {
  const existing = await prisma.job.findFirst({
    where: {
      type: "attendance:leave-lifecycle",
      payload: {
        path: ["dedupeKey"],
        equals: dedupeKey,
      },
    },
    select: { id: true },
  });
  return Boolean(existing);
}

async function recordJobDedupe(
  dedupeKey: string,
  meta: Record<string, any>,
  now: Date
): Promise<void> {
  await prisma.job.create({
    data: {
      type: "attendance:leave-lifecycle",
      status: "SUCCEEDED",
      payload: {
        dedupeKey,
        ...meta,
        dispatchedAt: now.toISOString(),
      },
      completedAt: now,
    },
  });
}
