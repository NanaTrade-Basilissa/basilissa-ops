import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/platform/rate-limit";
import { scoped } from "@/lib/platform/logger";

/**
 * `/iclock/getrequest` — the device's heartbeat, polled every ~8-20s asking
 * "any commands for me?" Fixed path, same reasoning as `/iclock/cdata`.
 * No commands are issued yet; always acknowledging keeps the device
 * connected without implementing the ADMS command-response format.
 */

const log = scoped("device-iclock-getrequest");
const RATE_LIMIT_MAX = 240;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export async function GET(request: NextRequest) {
  const sn = request.nextUrl.searchParams.get("SN") ?? "unknown";
  const info = request.nextUrl.searchParams.get("INFO");

  const limit = await rateLimit(`device-heartbeat:${sn}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!limit.success) {
    log.warn("device heartbeat rate-limited", { sn });
  } else if (info) {
    log.debug("device heartbeat", { sn, info });
  }

  return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
}
