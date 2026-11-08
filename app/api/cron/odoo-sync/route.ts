import { NextResponse, type NextRequest } from "next/server";
import { runNightlyOdooSyncSweep } from "@/lib/modules/odoo/jobs";
import { scoped } from "@/lib/platform/logger";

const log = scoped("api.cron.odoo-sync");

export async function POST(request: NextRequest) {
  return handleOdooSyncCron(request);
}

export async function GET(request: NextRequest) {
  return handleOdooSyncCron(request);
}

async function handleOdooSyncCron(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    const customHeader = request.headers.get("x-cron-secret");

    if (bearer !== cronSecret && customHeader !== cronSecret) {
      log.warn("Unauthorized Odoo sync cron trigger attempt");
      return NextResponse.json(
        { ok: false, error: "UNAUTHORIZED", message: "Invalid or missing cron secret" },
        { status: 401 },
      );
    }
  }

  const now = new Date();
  log.info("Starting nightly 12:00 AM Odoo sync cron sweep", { now: now.toISOString() });

  try {
    const result = await runNightlyOdooSyncSweep(now);
    log.info("Nightly Odoo sync cron sweep completed", {
      employeesFetched: result.employeeSync.totalFetched,
      attendanceCreated: result.attendanceSync.created,
      attendanceUpdated: result.attendanceSync.updated,
      attendanceFailed: result.attendanceSync.failed,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    log.error("Nightly Odoo sync cron failed", { error });
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: "Failed to execute nightly Odoo sync" },
      { status: 500 },
    );
  }
}
