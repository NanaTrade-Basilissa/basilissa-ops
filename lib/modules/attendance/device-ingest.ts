import "server-only";
import { Prisma, ProviderType } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { SYSTEM_ACTOR } from "@/lib/platform/audit";
import { scoped } from "@/lib/platform/logger";
import { zonedMinutesToUtc } from "@/lib/platform/date";
import { ingestEvent, type IngestCommand } from "./ingest";

const log = scoped("attendance.device-ingest");

/**
 * Turns a raw ZKTeco ADMS `ATTLOG` push into attendance events.
 *
 * The wire format is fixed by the terminal firmware, not by us — see
 * docs/architecture/device-investigation-findings.md for how this was
 * confirmed against real hardware. Each line is tab-separated:
 * `PIN, "YYYY-MM-DD HH:MM:SS", statusCode, verifyMethod, ...` (remaining
 * columns unused here).
 */

const ATTLOG_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

export type ParsedAttlogRow = {
  pin: string;
  /** "YYYY-MM-DD" as reported by the device — not yet an instant. */
  dateKey: string;
  hour: number;
  minute: number;
  second: number;
  statusCode: number;
  verifyMethod: number;
  rawLine: string;
};

export type AttlogParseResult = { ok: true; row: ParsedAttlogRow } | { ok: false; rawLine: string };

/** Pure by design — no I/O, so the wire format can be tested without a database. */
export function parseAttlogBody(body: string): AttlogParseResult[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((rawLine): AttlogParseResult => {
      const fields = rawLine.split("\t").map((f) => f.trim());
      const pin = fields[0];
      const match = fields[1] ? ATTLOG_TIMESTAMP.exec(fields[1]) : null;

      if (!pin || !match) return { ok: false, rawLine };

      const [, year, month, day, hour, minute, second] = match;
      return {
        ok: true,
        row: {
          pin,
          dateKey: `${year}-${month}-${day}`,
          hour: Number(hour),
          minute: Number(minute),
          second: Number(second),
          statusCode: Number(fields[2] ?? 0),
          verifyMethod: Number(fields[3] ?? 0),
          rawLine,
        },
      };
    });
}

export type DeviceAttlogRowOutcome =
  | { status: "ACCEPTED"; eventId: string; replayed: boolean }
  | { status: "QUARANTINED"; reason: string }
  | { status: "REJECTED"; reason: string };

export type RecordDeviceAttlogBatchInput = {
  /** The terminal's serial number, e.g. from `?SN=...` on the push request. */
  serialNumber: string;
  rawBody: string;
  _ingestFn?: typeof ingestEvent;
};

/**
 * Never guesses, never drops. A row that cannot be resolved to an employee
 * and a branch is quarantined for a human, matching the rest of this
 * platform's device-input handling — see architecture §7.2.
 */
export async function recordDeviceAttlogBatch(
  input: RecordDeviceAttlogBatchInput,
): Promise<DeviceAttlogRowOutcome[]> {
  const { serialNumber, rawBody } = input;
  const ingest = input._ingestFn ?? ingestEvent;
  const outcomes: DeviceAttlogRowOutcome[] = [];

  for (const entry of parseAttlogBody(rawBody)) {
    if (!entry.ok) {
      await quarantine(serialNumber, "MALFORMED_ATTLOG_LINE", { rawLine: entry.rawLine });
      outcomes.push({ status: "QUARANTINED", reason: "MALFORMED_ATTLOG_LINE" });
      continue;
    }

    const { row } = entry;

    // The device is a physical object bolted to one location — its branch is
    // a property of the device, registered once, never inferred from who
    // happens to punch on it.
    const device = await prisma.device.findUnique({
      where: { providerType_serialNumber: { providerType: ProviderType.FINGERPRINT, serialNumber } },
      select: { branchId: true, isActive: true, branch: { select: { timezone: true, isActive: true } } },
    });

    if (!device || !device.isActive || !device.branch.isActive) {
      await quarantine(serialNumber, "UNREGISTERED_DEVICE", row);
      outcomes.push({ status: "QUARANTINED", reason: "UNREGISTERED_DEVICE" });
      continue;
    }

    // Identity mapping is explicit and manual — an unmapped terminal PIN
    // must never be guessed at. Scoped to this specific device: the same
    // PIN number is not assumed unique across terminals.
    const identity = await prisma.employeeDeviceIdentity.findFirst({
      where: {
        providerType: ProviderType.FINGERPRINT,
        externalId: row.pin,
        deviceId: serialNumber,
        revokedAt: null,
      },
      select: { employeeId: true },
    });

    if (!identity) {
      await quarantine(serialNumber, "UNMAPPED_DEVICE_IDENTITY", row);
      outcomes.push({ status: "QUARANTINED", reason: "UNMAPPED_DEVICE_IDENTITY" });
      continue;
    }

    const branch = { id: device.branchId, timezone: device.branch.timezone };

    // The device sends a naive local wall-clock string, never its own
    // timezone. Converted against the branch's zone, not the server's —
    // consistent with how mobile punches resolve `branchTz`.
    const timeZone = branch.timezone || "Africa/Accra";
    const occurredAt = new Date(
      zonedMinutesToUtc(row.dateKey, row.hour * 60 + row.minute, timeZone).getTime() + row.second * 1000,
    );

    const command: IngestCommand = {
      providerType: ProviderType.FINGERPRINT,
      // Deterministic and provider-scoped: the same batch replayed by the
      // device (it resends its whole unsent buffer, not just new rows)
      // resolves to the same event rather than a duplicate.
      idempotencyKey: `fingerprint:${serialNumber}:${row.pin}:${row.dateKey}T${row.hour}:${row.minute}:${row.second}`,
      employeeId: identity.employeeId,
      branchId: branch.id,
      occurredAt,
      // Best-effort until the dedicated drift-probe job (Phase 2b) exists —
      // this conflates network delay with real drift, but "record skew on
      // every event" starts here rather than waiting for that job.
      clockSkewMs: Date.now() - occurredAt.getTime(),
      // Direction is derived by the ingest pipeline, never taken from the
      // device's punch-state button — architecture §7.2 is explicit about
      // this, so `statusCode` is recorded as evidence only, never mapped to
      // `directionHint`.
      deviceId: serialNumber,
      evidence: {
        deviceRawPayload: {
          statusCode: row.statusCode,
          verifyMethod: row.verifyMethod,
          rawLine: row.rawLine,
        },
      },
    };

    const result = await ingest(command, SYSTEM_ACTOR);

    if (!result.ok) {
      log.warn("device punch rejected by ingest pipeline", {
        serialNumber,
        pin: row.pin,
        reason: result.reason,
        message: result.message,
      });
      outcomes.push({ status: "REJECTED", reason: result.reason });
      continue;
    }

    outcomes.push({ status: "ACCEPTED", eventId: result.eventId, replayed: result.replayed });
  }

  return outcomes;
}

async function quarantine(serialNumber: string, reason: string, rawPayload: unknown): Promise<void> {
  log.warn("device attendance row quarantined", { serialNumber, reason });
  try {
    await prisma.quarantinedEvent.create({
      data: {
        providerType: ProviderType.FINGERPRINT,
        deviceId: serialNumber,
        reason,
        rawPayload: rawPayload as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    log.error("failed to persist quarantined device event", { serialNumber, reason, error });
  }
}
