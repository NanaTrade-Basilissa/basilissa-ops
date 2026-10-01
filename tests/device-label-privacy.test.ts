import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/platform/prisma";
import { deviceNameFromLabel } from "@/lib/platform/push";
import { getEmployee } from "@/lib/modules/employees/server";
import { revokeDeviceIdentity } from "@/lib/modules/employees/actions";
import * as identityModule from "@/lib/modules/identity/server";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * Once the app registers for push, an identity's label is JSON that includes the
 * push token. These tests pin that the token never reaches a screen or the audit
 * log, which cannot be edited afterwards.
 */

const TOKEN = "e7vU9U4-l0Blokw4fK_juT:APA91bSECRETTOKENVALUE";
const JSON_LABEL = JSON.stringify({ deviceName: "TECNO KM5", pushToken: TOKEN, platform: "android" });

describe("deviceNameFromLabel", () => {
  it("returns the name from a structured label and drops everything else", () => {
    expect(deviceNameFromLabel(JSON_LABEL)).toBe("TECNO KM5");
  });
  it("returns a plain label as the name", () => {
    expect(deviceNameFromLabel("iPhone")).toBe("iPhone");
    expect(deviceNameFromLabel("Front desk")).toBe("Front desk");
  });
  it("returns null for nothing useful", () => {
    expect(deviceNameFromLabel(null)).toBeNull();
    expect(deviceNameFromLabel(undefined)).toBeNull();
    expect(deviceNameFromLabel(JSON.stringify({ pushToken: TOKEN }))).toBeNull();
  });
});

describe("employee detail", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("hands the page a device name, never the push token", async () => {
    vi.spyOn(prisma.employee, "findFirst").mockResolvedValueOnce({
      id: "emp_1",
      deviceIdentities: [
        { id: "i1", providerType: "MOBILE_APP", externalId: "x", deviceId: "x", label: JSON_LABEL, enrolledAt: new Date() },
        { id: "i2", providerType: "FINGERPRINT", externalId: "7", deviceId: "SN-1", label: "Front desk", enrolledAt: new Date() },
      ],
    } as never);

    const employee = await getEmployee("emp_1", { kind: "all" });

    expect(employee!.deviceIdentities.map((d) => d.label)).toEqual(["TECNO KM5", "Front desk"]);
    expect(JSON.stringify(employee)).not.toContain(TOKEN);
  });

  it("returns null when the employee is not visible", async () => {
    vi.spyOn(prisma.employee, "findFirst").mockResolvedValueOnce(null as never);
    expect(await getEmployee("emp_1", { kind: "all" })).toBeNull();
  });
});

describe("releasing a device", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("records the device name in the audit log, not the push token", async () => {
    vi.spyOn(identityModule, "requireAuth").mockResolvedValueOnce({
      userId: "u1",
      name: "HR",
      email: "hr@basilissa.invalid",
      status: "ACTIVE",
      assignments: [{ role: "HR", scopeType: "GLOBAL", scopeId: "" }],
    } as never);
    vi.spyOn(prisma.employeeDeviceIdentity, "findUnique").mockResolvedValueOnce({
      id: "i1",
      employeeId: "emp_1",
      externalId: "hw_1",
      providerType: "MOBILE_APP",
      label: JSON_LABEL,
      revokedAt: null,
      employee: { branchAssignments: [{ branchId: "b1" }] },
    } as never);
    vi.spyOn(prisma.employeeDeviceIdentity, "update").mockResolvedValueOnce({} as never);
    const audit = vi.spyOn(prisma.auditLog, "create").mockResolvedValueOnce({} as never);

    const form = new FormData();
    form.set("deviceIdentityId", "i1");
    await revokeDeviceIdentity(undefined, form);

    const written = JSON.stringify(audit.mock.calls[0]![0]);
    expect(written).toContain("TECNO KM5");
    expect(written).not.toContain(TOKEN);
    expect(written).not.toContain("pushToken");
  });
});
