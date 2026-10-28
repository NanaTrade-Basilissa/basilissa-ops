import { NextResponse, type NextRequest } from "next/server";
import {
  autoCloseStaleDays,
  dispatchMissedClockInReminders,
  dispatchUpcomingShiftReminders,
  runDailySettlementSweep,
  dispatchAllLeaveLifecycleReminders,
} from "@/lib/modules/attendance/jobs";
import { drainPendingJobs } from "@/lib/modules/identity/server";
import { autoSubmitExpiredAttempts } from "@/lib/modules/aptitude/jobs";
import { expireUrgentBanners } from "@/lib/modules/announcements/jobs";
import { scoped } from "@/lib/platform/logger";

const log = scoped("api.cron.attendance");

export async function POST(request: NextRequest) {
  return handleCron(request);
}

export async function GET(request: NextRequest) {
  return handleCron(request);
}

async function handleCron(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    const customHeader = request.headers.get("x-cron-secret");

    if (bearer !== cronSecret && customHeader !== cronSecret) {
      log.warn("Unauthorized attendance cron trigger attempt");
      return NextResponse.json(
        { ok: false, error: "UNAUTHORIZED", message: "Invalid or missing cron secret" },
        { status: 401 },
      );
    }
  }

  const now = new Date();
  log.info("Starting attendance cron sweep", { now: now.toISOString() });

  try {
    const [autoClose, reminders, missedClockIn, settlement, leaveReminders, jobSweep, aptitudeSweep, bannerSweep] = await Promise.all([
      autoCloseStaleDays(now).catch((err) => {
        log.error("Auto-close sweep error", { err });
        return { error: String(err) };
      }),
      dispatchUpcomingShiftReminders(now).catch((err) => {
        log.error("Shift reminders sweep error", { err });
        return { error: String(err) };
      }),
      dispatchMissedClockInReminders(now).catch((err) => {
        log.error("Missed clock-in reminders sweep error", { err });
        return { error: String(err) };
      }),
      runDailySettlementSweep(now).catch((err) => {
        log.error("Daily settlement sweep error", { err });
        return { error: String(err) };
      }),
      dispatchAllLeaveLifecycleReminders(now).catch((err) => {
        log.error("Leave reminders sweep error", { err });
        return { error: String(err) };
      }),
      drainPendingJobs(10).catch((err) => {
        log.error("Job queue drain error", { err });
        return { error: String(err) };
      }),
      autoSubmitExpiredAttempts(now).catch((err) => {
        log.error("Aptitude auto-submit sweep error", { err });
        return { error: String(err) };
      }),
      expireUrgentBanners(now).catch((err) => {
        log.error("Banner expiry sweep error", { err });
        return { error: String(err) };
      }),
    ]);

    log.info("Cron sweep completed successfully", {
      autoClose,
      reminders,
      missedClockIn,
      settlement,
      leaveReminders,
      jobSweep,
      aptitudeSweep,
      bannerSweep,
    });

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      results: {
        autoClose,
        reminders,
        missedClockIn,
        settlement,
        leaveReminders,
        jobSweep,
        aptitudeSweep,
        bannerSweep,
      },
    });
  } catch (error) {
    log.error("Attendance cron execution failed", { error });
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: "Failed to execute attendance cron" },
      { status: 500 },
    );
  }
}
