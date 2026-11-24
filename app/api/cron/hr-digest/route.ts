import { NextResponse, type NextRequest } from "next/server";
import { runHrDailyAttendanceDigest } from "@/lib/modules/attendance/hr-digest";
import { scoped } from "@/lib/platform/logger";

const log = scoped("api.cron.hr-digest");

export async function POST(request: NextRequest) {
  return handleHrDigestCron(request);
}

export async function GET(request: NextRequest) {
  return handleHrDigestCron(request);
}

async function handleHrDigestCron(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    const customHeader = request.headers.get("x-cron-secret");

    if (bearer !== cronSecret && customHeader !== cronSecret) {
      log.warn("Unauthorized HR daily digest cron trigger attempt");
      return NextResponse.json(
        { ok: false, error: "UNAUTHORIZED", message: "Invalid or missing cron secret" },
        { status: 401 },
      );
    }
  }

  const dateParam = request.nextUrl.searchParams.get("date");
  const overrideDateKey =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined;

  const now = new Date();
  log.info("Starting morning HR daily attendance digest cron", {
    now: now.toISOString(),
    overrideDateKey,
  });

  try {
    const result = await runHrDailyAttendanceDigest(now, overrideDateKey);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    log.error("HR daily attendance digest cron failed", { error });
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: "Failed to run HR daily attendance digest" },
      { status: 500 },
    );
  }
}
