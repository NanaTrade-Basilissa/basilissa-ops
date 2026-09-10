import { NextResponse, type NextRequest } from "next/server";
import {
  autoCloseStaleDays,
  dispatchUpcomingShiftReminders,
  runDailySettlementSweep,
} from "@/lib/modules/attendance/jobs";
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
    const [autoClose, reminders, settlement] = await Promise.all([
      autoCloseStaleDays(now).catch((err) => {
        log.error("Auto-close sweep error", { err });
        return { error: String(err) };
      }),
      dispatchUpcomingShiftReminders(now).catch((err) => {
        log.error("Shift reminders sweep error", { err });
        return { error: String(err) };
      }),
      runDailySettlementSweep(now).catch((err) => {
        log.error("Daily settlement sweep error", { err });
        return { error: String(err) };
      }),
    ]);

    log.info("Attendance cron sweep completed successfully", {
      autoClose,
      reminders,
      settlement,
    });

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      results: {
        autoClose,
        reminders,
        settlement,
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
