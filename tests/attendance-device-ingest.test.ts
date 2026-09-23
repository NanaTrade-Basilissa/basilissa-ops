import { describe, expect, it, vi, beforeEach } from "vitest";
import { ProviderType } from "@prisma/client";
import {
  parseAttlogBody,
  recordDeviceAttlogBatch,
  recordDeviceActivity,
  touchDeviceLastSeen,
  computeTimeZoneOptionValue,
  buildAdmsHandshakeResponse,
  resolveDeviceTimeZone,
} from "@/lib/modules/attendance/server";
import { prisma } from "@/lib/platform/prisma";

/**
 * The wire format here is not ours to choose — it's ZKTeco's ADMS push
 * protocol, confirmed against a real K40 Pro. See
 * docs/architecture/device-investigation-findings.md for the captured
 * payloads these fixtures are drawn from.
 */

describe("parseAttlogBody", () => {
  it("parses a real captured ATTLOG line", () => {
    const body = "2\t2026-09-22 18:50:23\t0\t1\t0\t0\t0\t0\t0\t0\t";
    const [result] = parseAttlogBody(body);

    expect(result?.ok).toBe(true);
    if (result?.ok) {
      expect(result.row).toEqual({
        pin: "2",
        dateKey: "2026-09-22",
        hour: 18,
        minute: 50,
        second: 23,
        statusCode: 0,
        verifyMethod: 1,
        rawLine: body.trim(),
      });
    }
  });

  it("parses multiple rows in one batch, in order", () => {
    const body = [
      "1\t2026-09-22 09:37:58\t5\t0\t0\t0\t0\t0\t0\t0\t",
      "1\t2026-09-22 09:42:06\t5\t0\t0\t0\t0\t0\t0\t0\t",
    ].join("\n");

    const results = parseAttlogBody(body);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("skips blank lines without producing a result", () => {
    const body = "2\t2026-09-22 18:50:23\t0\t1\t0\t0\t0\t0\t0\t0\t\n\n\n";
    expect(parseAttlogBody(body)).toHaveLength(1);
  });

  it("flags a line with no parseable timestamp as malformed rather than dropping it", () => {
    const rawLine = "2\tnot-a-timestamp\t0\t1";
    const [result] = parseAttlogBody(rawLine);
    expect(result).toEqual({ ok: false, rawLine });
  });

  it("flags a line with no PIN as malformed", () => {
    const rawLine = "\t2026-09-22 18:50:23\t0\t1";
    const [result] = parseAttlogBody(rawLine);
    expect(result).toEqual({ ok: false, rawLine: rawLine.trim() });
  });
});

describe("recordDeviceAttlogBatch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const SN = "GED7234700295";

  it("quarantines a malformed line instead of dropping or guessing", async () => {
    const quarantineSpy = vi
      .spyOn(prisma.quarantinedEvent, "create")
      .mockResolvedValueOnce({} as never);

    const outcomes = await recordDeviceAttlogBatch({
      serialNumber: SN,
      rawBody: "garbage\tline",
    });

    expect(outcomes).toEqual([{ status: "QUARANTINED", reason: "MALFORMED_ATTLOG_LINE" }]);
    expect(quarantineSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerType: ProviderType.FINGERPRINT,
          deviceId: SN,
          reason: "MALFORMED_ATTLOG_LINE",
        }),
      }),
    );
  });

  it("quarantines a push from a device that was never registered, never guesses its branch", async () => {
    vi.spyOn(prisma.device, "findUnique").mockResolvedValueOnce(null);
    const quarantineSpy = vi
      .spyOn(prisma.quarantinedEvent, "create")
      .mockResolvedValueOnce({} as never);
    const identitySpy = vi.spyOn(prisma.employeeDeviceIdentity, "findFirst");
    const ingestSpy = vi.fn();

    const outcomes = await recordDeviceAttlogBatch({
      serialNumber: SN,
      rawBody: "2\t2026-09-22 18:50:23\t0\t1\t0\t0\t0\t0\t0\t0\t",
      _ingestFn: ingestSpy,
    });

    expect(outcomes).toEqual([{ status: "QUARANTINED", reason: "UNREGISTERED_DEVICE" }]);
    expect(quarantineSpy).toHaveBeenCalled();
    // Branch resolution fails before identity is even looked up.
    expect(identitySpy).not.toHaveBeenCalled();
    expect(ingestSpy).not.toHaveBeenCalled();
  });

  const registeredDevice = {
    branchId: "branch_1",
    isActive: true,
    branch: { timezone: "Africa/Accra", isActive: true },
  };

  it("quarantines a PIN with no EmployeeDeviceIdentity on this device, never guesses", async () => {
    vi.spyOn(prisma.device, "findUnique").mockResolvedValueOnce(registeredDevice as never);
    vi.spyOn(prisma.employeeDeviceIdentity, "findFirst").mockResolvedValueOnce(null);
    const quarantineSpy = vi
      .spyOn(prisma.quarantinedEvent, "create")
      .mockResolvedValueOnce({} as never);
    const ingestSpy = vi.fn();

    const outcomes = await recordDeviceAttlogBatch({
      serialNumber: SN,
      rawBody: "99\t2026-09-22 18:50:23\t0\t1\t0\t0\t0\t0\t0\t0\t",
      _ingestFn: ingestSpy,
    });

    expect(outcomes).toEqual([{ status: "QUARANTINED", reason: "UNMAPPED_DEVICE_IDENTITY" }]);
    expect(quarantineSpy).toHaveBeenCalled();
    expect(ingestSpy).not.toHaveBeenCalled();
  });

  it("builds a FINGERPRINT ingest command from a resolved row and never sets directionHint from the status code", async () => {
    vi.spyOn(prisma.device, "findUnique").mockResolvedValueOnce(registeredDevice as never);
    vi.spyOn(prisma.employeeDeviceIdentity, "findFirst").mockResolvedValueOnce({
      employeeId: "emp_1",
    } as never);

    const ingestSpy = vi.fn().mockResolvedValueOnce({
      ok: true,
      eventId: "evt_1",
      replayed: false,
      direction: "IN",
      workDateKey: "2026-09-22",
      day: null,
    });

    const outcomes = await recordDeviceAttlogBatch({
      serialNumber: SN,
      rawBody: "2\t2026-09-22 18:50:23\t0\t1\t0\t0\t0\t0\t0\t0\t",
      _ingestFn: ingestSpy,
    });

    expect(outcomes).toEqual([{ status: "ACCEPTED", eventId: "evt_1", replayed: false }]);
    expect(ingestSpy).toHaveBeenCalledTimes(1);

    const [command] = ingestSpy.mock.calls[0]!;
    expect(command.providerType).toBe(ProviderType.FINGERPRINT);
    expect(command.employeeId).toBe("emp_1");
    expect(command.branchId).toBe("branch_1");
    expect(command.deviceId).toBe(SN);
    expect(command.directionHint).toBeUndefined();
    expect(command.occurredAt.toISOString()).toBe("2026-09-22T18:50:23.000Z");
    expect(command.idempotencyKey).toBe(`fingerprint:${SN}:2:2026-09-22T18:50:23`);
  });

  it("surfaces an ingest-pipeline rejection instead of silently swallowing it", async () => {
    vi.spyOn(prisma.device, "findUnique").mockResolvedValueOnce(registeredDevice as never);
    vi.spyOn(prisma.employeeDeviceIdentity, "findFirst").mockResolvedValueOnce({
      employeeId: "emp_1",
    } as never);

    const ingestSpy = vi.fn().mockResolvedValueOnce({
      ok: false,
      reason: "EMPLOYEE_NOT_ACTIVE",
      message: "Employee is not active",
    });

    const outcomes = await recordDeviceAttlogBatch({
      serialNumber: SN,
      rawBody: "2\t2026-09-22 18:50:23\t0\t1\t0\t0\t0\t0\t0\t0\t",
      _ingestFn: ingestSpy,
    });

    expect(outcomes).toEqual([{ status: "REJECTED", reason: "EMPLOYEE_NOT_ACTIVE" }]);
  });
});

/**
 * These never store the request body for USER/OPERLOG — only a caller-built
 * summary string — and never throw, since a logging failure must not be why
 * a device's actual push gets rejected.
 */
describe("recordDeviceActivity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const SN = "GED7234700295";

  it("writes a DeviceLog row and bumps the device's lastSeenAt together", async () => {
    vi.spyOn(prisma, "$transaction").mockImplementation((ops: unknown) =>
      Promise.all(ops as Promise<unknown>[]),
    );
    const createSpy = vi.spyOn(prisma.deviceLog, "create").mockResolvedValueOnce({} as never);
    const updateManySpy = vi.spyOn(prisma.device, "updateMany").mockResolvedValueOnce({ count: 1 });

    await recordDeviceActivity(SN, "ATTLOG", "3 row(s): 2 accepted, 1 quarantined");

    expect(createSpy).toHaveBeenCalledWith({
      data: { serialNumber: SN, kind: "ATTLOG", summary: "3 row(s): 2 accepted, 1 quarantined" },
    });
    expect(updateManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { providerType: ProviderType.FINGERPRINT, serialNumber: SN },
        data: { lastSeenAt: expect.any(Date) },
      }),
    );
  });

  it("never throws when the write fails — a logging failure must not reject a real push", async () => {
    vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("db unavailable"));

    await expect(recordDeviceActivity(SN, "HANDSHAKE", "Connected")).resolves.toBeUndefined();
  });
});

describe("touchDeviceLastSeen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("bumps lastSeenAt without writing a DeviceLog row", async () => {
    const updateManySpy = vi.spyOn(prisma.device, "updateMany").mockResolvedValueOnce({ count: 1 });
    const createSpy = vi.spyOn(prisma.deviceLog, "create");

    await touchDeviceLastSeen("GED7234700295");

    expect(updateManySpy).toHaveBeenCalledWith({
      where: { providerType: ProviderType.FINGERPRINT, serialNumber: "GED7234700295" },
      data: { lastSeenAt: expect.any(Date) },
    });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("never throws when the update fails", async () => {
    vi.spyOn(prisma.device, "updateMany").mockRejectedValueOnce(new Error("db unavailable"));
    await expect(touchDeviceLastSeen("GED7234700295")).resolves.toBeUndefined();
  });
});

/**
 * A bare "OK" to the handshake is the likely cause of an observed clock
 * reset on real hardware — see the doc comment on buildAdmsHandshakeResponse.
 * These pin the exact wire format against a working reference
 * implementation (github.com/skylinebiz/adms), not a guess.
 */
describe("computeTimeZoneOptionValue", () => {
  it("encodes a whole-hour offset as a plain signed integer", () => {
    // Africa/Accra is UTC+0 year-round — the case this project actually
    // needs, and the one the reference implementation notes as confirmed
    // against real hardware.
    expect(computeTimeZoneOptionValue("Africa/Accra", new Date("2026-09-23T12:00:00Z"))).toBe("0");
  });

  it("encodes a different whole-hour offset correctly", () => {
    expect(computeTimeZoneOptionValue("Asia/Bangkok", new Date("2026-09-23T12:00:00Z"))).toBe("7");
  });

  it("encodes a fractional offset as total signed minutes", () => {
    // India Standard Time, +05:30 — not the case this project needs today,
    // but the format must still be right if a branch is ever added there.
    expect(computeTimeZoneOptionValue("Asia/Kolkata", new Date("2026-09-23T12:00:00Z"))).toBe("330");
  });
});

describe("buildAdmsHandshakeResponse", () => {
  it("matches the field set and format the terminal firmware expects", () => {
    const body = buildAdmsHandshakeResponse("GED7234700295", "Africa/Accra");
    expect(body).toBe(
      [
        "GET OPTION FROM: GED7234700295",
        "ATTLOGStamp=9999",
        "OPERLOGStamp=9999",
        "ErrorDelay=60",
        "Delay=30",
        "TransTimes=00:00;14:05",
        "TransInterval=1",
        "TransFlag=1111111111",
        "TimeZone=0",
        "Realtime=1",
        "Encrypt=0",
        "",
      ].join("\n"),
    );
  });
});

describe("resolveDeviceTimeZone", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the registered device's branch timezone", async () => {
    vi.spyOn(prisma.device, "findUnique").mockResolvedValueOnce({
      branch: { timezone: "Asia/Bangkok" },
    } as never);

    expect(await resolveDeviceTimeZone("SN-1")).toBe("Asia/Bangkok");
  });

  it("falls back to the app default for an unregistered device", async () => {
    vi.spyOn(prisma.device, "findUnique").mockResolvedValueOnce(null);
    expect(await resolveDeviceTimeZone("SN-unknown")).toBe("Africa/Accra");
  });
});
