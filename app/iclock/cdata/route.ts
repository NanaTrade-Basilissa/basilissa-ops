import { NextResponse, type NextRequest } from "next/server";
import {
  recordDeviceAttlogBatch,
  recordDeviceActivity,
  buildAdmsHandshakeResponse,
  resolveDeviceTimeZone,
} from "@/lib/modules/attendance/server";
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
  await recordDeviceActivity(sn, "HANDSHAKE", `Connected (${request.nextUrl.search || "no params"})`);

  // A bare "OK" here was almost certainly why a real unit's clock kept
  // resetting: ADMS firmware expects a config block including `TimeZone=`,
  // and appears to fall back to a firmware default without one. See the
  // doc comment on buildAdmsHandshakeResponse for the research trail.
  const timeZone = await resolveDeviceTimeZone(sn);
  const body = buildAdmsHandshakeResponse(sn, timeZone);
  return new NextResponse(body, { status: 200, headers: { "Content-Type": "text/plain" } });
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
    const accepted = outcomes.filter((o) => o.status === "ACCEPTED").length;
    const quarantined = outcomes.filter((o) => o.status === "QUARANTINED").length;
    const rejected = outcomes.filter((o) => o.status === "REJECTED").length;
    log.info("device attendance batch processed", { sn, total: outcomes.length, accepted, quarantined, rejected });
    await recordDeviceActivity(
      sn,
      "ATTLOG",
      `${outcomes.length} row(s): ${accepted} accepted, ${quarantined} quarantined, ${rejected} rejected`,
    );
  } else if (table === "USER" || table === "OPERLOG") {
    // Acknowledged and discarded, never stored — OPERLOG is where a real
    // unit pushed a full fingerprint template unprompted during testing, and
    // USER carries plaintext passwords. Only a row count is logged, never
    // the body. See docs/architecture/device-investigation-findings.md.
    const rowCount = rawBody.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
    log.debug("device push table ignored by design", { sn, table, rowCount });
    await recordDeviceActivity(sn, table, `${rowCount} row(s) received, discarded by design (not attendance data)`);
  } else {
    log.warn("device push unrecognized table", { sn, table });
    await recordDeviceActivity(sn, "UNKNOWN_TABLE", `table=${table ?? "(missing)"}, ${rawBody.length} bytes`);
  }

  return ack();
}
