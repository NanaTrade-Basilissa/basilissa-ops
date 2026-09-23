import { NextResponse, type NextRequest } from "next/server";
import { recordDeviceAttlogBatch } from "@/lib/modules/attendance/server";
import { rateLimit } from "@/lib/platform/rate-limit";
import { scoped } from "@/lib/platform/logger";

/**
 * `/iclock/cdata` — fixed by ZKTeco's ADMS firmware, not chosen by us. A
 * terminal configured with `Server Address = <this app>` always calls this
 * exact path; there is no way to point it anywhere else. Confirmed against a
 * real K40 Pro — see docs/architecture/device-investigation-findings.md.
 *
 * The device does not react meaningfully to a non-200 response (no retry
 * backoff, no error surfaced to the user), so this always acknowledges with
 * `OK` even when a row is rejected — rejection is handled by quarantining
 * the row for a human, not by an HTTP status the terminal can't act on.
 */

const log = scoped("device-iclock-cdata");
const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function ack(): NextResponse {
  return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function GET(request: NextRequest) {
  // The device's initial handshake: `?SN=...&options=all&language=...&pushver=...`
  const sn = request.nextUrl.searchParams.get("SN") ?? "unknown";
  log.info("device handshake", { sn, query: request.nextUrl.search });
  return ack();
}

export async function POST(request: NextRequest) {
  const sn = request.nextUrl.searchParams.get("SN");
  const table = request.nextUrl.searchParams.get("table");

  if (!sn) {
    log.warn("device push missing SN", { table });
    return ack();
  }

  const limit = await rateLimit(`device-ingest:${sn}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!limit.success) {
    log.warn("device push rate-limited", { sn });
    return ack();
  }

  const rawBody = await request.text();

  if (table === "ATTLOG") {
    const outcomes = await recordDeviceAttlogBatch({ serialNumber: sn, rawBody });
    log.info("device attendance batch processed", {
      sn,
      total: outcomes.length,
      accepted: outcomes.filter((o) => o.status === "ACCEPTED").length,
      quarantined: outcomes.filter((o) => o.status === "QUARANTINED").length,
      rejected: outcomes.filter((o) => o.status === "REJECTED").length,
    });
  } else {
    // USER and OPERLOG are acknowledged and discarded, never stored.
    // OPERLOG is where a real unit pushed a full fingerprint template
    // unprompted during testing — see the findings doc. Nothing here reads
    // or persists either table.
    log.debug("device push table ignored by design", { sn, table });
  }

  return ack();
}
