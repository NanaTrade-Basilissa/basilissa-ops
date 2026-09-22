import { describe, expect, it, vi, beforeEach } from "vitest";
import { ProviderType } from "@prisma/client";
import { parseAttlogBody, recordDeviceAttlogBatch } from "@/lib/modules/attendance/server";
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
