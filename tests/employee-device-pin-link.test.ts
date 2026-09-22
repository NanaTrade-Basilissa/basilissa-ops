import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderType, Role, ScopeType, UserStatus } from "@prisma/client";
import { linkDevicePin } from "@/lib/modules/employees/actions";
import { prisma } from "@/lib/platform/prisma";
import * as identityModule from "@/lib/modules/identity/server";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

/**
 * linkDevicePin never guesses a branch and never lets two active employees
 * share one PIN on one device — both checked here, not left to a database
 * constraint (there isn't one; see B9 in open-decisions.md).
 */
describe("linkDevicePin", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const hrActor = {
    userId: "hr_1",
    name: "HR Person",
    email: "hr@basilissa.com",
    status: UserStatus.ACTIVE,
    assignments: [{ role: Role.HR, scopeType: ScopeType.GLOBAL, scopeId: "" }],
  };

  function formData(fields: Record<string, string>): FormData {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  }

  it("refuses a PIN for a device at a branch the employee isn't assigned to", async () => {
    vi.spyOn(identityModule, "requireAuth").mockResolvedValueOnce(hrActor as never);
    vi.spyOn(prisma.employee, "findUnique").mockResolvedValueOnce({
      branchAssignments: [{ branchId: "branch_home" }],
    } as never);
    vi.spyOn(prisma.device, "findUnique").mockResolvedValueOnce({
      id: "device_1",
      serialNumber: "SN-1",
      branchId: "branch_other",
      label: null,
    } as never);

    const result = await linkDevicePin(
      "emp_1",
      undefined,
      formData({ deviceId: "device_1", pin: "7" }),
    );

    expect(result?.error).toContain("not assigned");
  });

  it("refuses a PIN already claimed by someone else on the same device", async () => {
    vi.spyOn(identityModule, "requireAuth").mockResolvedValueOnce(hrActor as never);
    vi.spyOn(prisma.employee, "findUnique").mockResolvedValueOnce({
      branchAssignments: [{ branchId: "branch_1" }],
    } as never);
    vi.spyOn(prisma.device, "findUnique").mockResolvedValueOnce({
      id: "device_1",
      serialNumber: "SN-1",
      branchId: "branch_1",
      label: null,
    } as never);
    vi.spyOn(prisma.employeeDeviceIdentity, "findFirst").mockResolvedValueOnce({
      id: "existing_link",
    } as never);

    const result = await linkDevicePin(
      "emp_1",
      undefined,
      formData({ deviceId: "device_1", pin: "7" }),
    );

    expect(result?.error).toContain("already linked to someone else");
    expect(result?.fieldErrors?.pin).toBeDefined();
  });

  it("links the PIN and closes any prior active link for this employee on this device", async () => {
    vi.spyOn(identityModule, "requireAuth").mockResolvedValueOnce(hrActor as never);
    vi.spyOn(prisma.employee, "findUnique").mockResolvedValueOnce({
      branchAssignments: [{ branchId: "branch_1" }],
    } as never);
    vi.spyOn(prisma.device, "findUnique").mockResolvedValueOnce({
      id: "device_1",
      serialNumber: "SN-1",
      branchId: "branch_1",
      label: "Front desk",
    } as never);
    vi.spyOn(prisma.employeeDeviceIdentity, "findFirst").mockResolvedValueOnce(null);

    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const create = vi.fn().mockResolvedValue({ id: "new_link" });
    vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: unknown) =>
      (cb as (tx: unknown) => Promise<unknown>)({
        employeeDeviceIdentity: { updateMany, create },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      }),
    );

    const result = await linkDevicePin(
      "emp_1",
      undefined,
      formData({ deviceId: "device_1", pin: "7" }),
    );

    expect(result?.success).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employeeId: "emp_1",
          providerType: ProviderType.FINGERPRINT,
          deviceId: "SN-1",
          revokedAt: null,
        }),
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeId: "emp_1",
          providerType: ProviderType.FINGERPRINT,
          externalId: "7",
          deviceId: "SN-1",
        }),
      }),
    );
  });

  it("refuses without employee:write, even with a valid device and assignment", async () => {
    vi.spyOn(identityModule, "requireAuth").mockResolvedValueOnce({
      userId: "manager_1",
      name: "Branch Manager",
      email: "manager@basilissa.com",
      status: UserStatus.ACTIVE,
      assignments: [{ role: Role.BRANCH_MANAGER, scopeType: ScopeType.BRANCH, scopeId: "branch_1" }],
    } as never);
    vi.spyOn(prisma.employee, "findUnique").mockResolvedValueOnce({
      branchAssignments: [{ branchId: "branch_1" }],
    } as never);
    vi.spyOn(prisma.device, "findUnique").mockResolvedValueOnce({
      id: "device_1",
      serialNumber: "SN-1",
      branchId: "branch_1",
      label: null,
    } as never);

    const result = await linkDevicePin(
      "emp_1",
      undefined,
      formData({ deviceId: "device_1", pin: "7" }),
    );

    expect(result?.error).toContain("do not have permission");
  });
});
