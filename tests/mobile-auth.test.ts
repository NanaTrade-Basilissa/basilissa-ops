import { describe, expect, it, vi, beforeEach } from "vitest";
import { open } from "@/lib/platform/secret-box";

const mockEmployeeFindFirst = vi.fn();
const mockEmployeeFindUnique = vi.fn();
const mockDeviceFindFirst = vi.fn();
const mockDeviceCreate = vi.fn();
const mockDeviceUpsert = vi.fn();
const mockDeviceUpdateMany = vi.fn();
const mockRecordAudit = vi.fn();

vi.mock("@/lib/platform/audit", () => ({
  recordAudit: (...args: unknown[]) => mockRecordAudit(...args),
  SYSTEM_ACTOR: { userId: null, email: null, role: "SYSTEM" },
}));

vi.mock("@/lib/platform/prisma", () => ({
  prisma: {
    employee: {
      findFirst: (...args: unknown[]) => mockEmployeeFindFirst(...args),
      findUnique: (...args: unknown[]) => mockEmployeeFindUnique(...args),
    },
    employeeDeviceIdentity: {
      findFirst: (...args: unknown[]) => mockDeviceFindFirst(...args),
      create: (...args: unknown[]) => mockDeviceCreate(...args),
      upsert: (...args: unknown[]) => mockDeviceUpsert(...args),
      updateMany: (...args: unknown[]) => mockDeviceUpdateMany(...args),
    },
  },
}));

const { requestMobileOtp, verifyMobileOtp } = await import("@/lib/modules/attendance/mobile-auth");

describe("mobile-auth 6-digit OTP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a 6-digit OTP code and returns challenge token in simulation mode", async () => {
    mockEmployeeFindFirst.mockResolvedValueOnce({
      id: "emp_kwame_001",
      phone: "+233244111222",
      firstName: "Kwame",
      lastName: "Mensah",
      status: "ACTIVE",
    });

    const result = await requestMobileOtp("0244111222");

    expect(result.ok).toBe(true);
    expect(result.challengeToken).toBeDefined();
    expect(result.expiresInSeconds).toBe(300);

    // In local simulation mode, debugOtp is returned as a 6-digit string
    expect(result.debugOtp).toBeDefined();
    expect(result.debugOtp).toHaveLength(6);
    expect(result.debugOtp).toMatch(/^\d{6}$/);

    // Inspect the sealed payload
    const payload = JSON.parse(open(result.challengeToken!, "mobile-otp"));
    expect(payload.phone).toBe("+233244111222");
    expect(payload.employeeId).toBe("emp_kwame_001");
    expect(payload.codeHash).toBeDefined();
  });

  it("verifies a valid 6-digit OTP and binds device", async () => {
    mockEmployeeFindFirst.mockResolvedValueOnce({
      id: "emp_kwame_001",
      phone: "+233244111222",
      firstName: "Kwame",
      lastName: "Mensah",
      status: "ACTIVE",
    });

    const requestResult = await requestMobileOtp("0244111222");
    expect(requestResult.ok).toBe(true);
    const code = requestResult.debugOtp!;
    expect(code).toHaveLength(6);

    mockEmployeeFindUnique.mockResolvedValueOnce({
      id: "emp_kwame_001",
      employeeCode: "BAS-ACC-001",
      firstName: "Kwame",
      lastName: "Mensah",
      phone: "+233244111222",
      email: "kwame@basilissa.com",
      jobTitle: "Shift Supervisor",
      status: "ACTIVE",
      branchAssignments: [
        {
          isPrimary: true,
          branch: {
            id: "branch_accra_mall",
            name: "Accra Mall",
            slug: "accra-mall",
            latitude: 5.6214,
            longitude: -0.1732,
            geofenceRadiusMeters: 100,
            geofenceEnabled: true,
          },
        },
      ],
    });

    mockDeviceFindFirst.mockResolvedValueOnce(null);
    mockDeviceUpdateMany.mockResolvedValueOnce({ count: 0 });
    mockDeviceUpsert.mockResolvedValueOnce({
      id: "dev_identity_01",
      employeeId: "emp_kwame_001",
      deviceId: "test_device_unit_test_01",
      revokedAt: null,
    });

    const verifyResult = await verifyMobileOtp({
      phone: "0244111222",
      code,
      challengeToken: requestResult.challengeToken!,
      deviceId: "test_device_unit_test_01",
      deviceName: "Test Phone",
    });

    expect(verifyResult.ok).toBe(true);
    expect(verifyResult.deviceToken).toBeDefined();
    expect(verifyResult.employee?.phone).toBe("+233244111222");
    expect(verifyResult.employee?.branches).toHaveLength(1);
    expect(verifyResult.employee?.branches[0].name).toBe("Accra Mall");
  });

  it("rejects an invalid OTP code", async () => {
    mockEmployeeFindFirst.mockResolvedValueOnce({
      id: "emp_kwame_001",
      phone: "+233244111222",
      firstName: "Kwame",
      lastName: "Mensah",
      status: "ACTIVE",
    });

    const requestResult = await requestMobileOtp("0244111222");
    expect(requestResult.ok).toBe(true);

    const verifyResult = await verifyMobileOtp({
      phone: "0244111222",
      code: "000000", // Wrong 6-digit code
      challengeToken: requestResult.challengeToken!,
      deviceId: "test_device_unit_test_02",
    });

    expect(verifyResult.ok).toBe(false);
    expect(verifyResult.error).toBe("INVALID_CODE");
  });

  it("rejects unknown phone number", async () => {
    mockEmployeeFindFirst.mockResolvedValueOnce(null);

    const result = await requestMobileOtp("0200000000");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("EMPLOYEE_NOT_FOUND");
  });

  it("rejects login when device is already bound to another employee (1 Phone -> 1 Staff Member)", async () => {
    mockEmployeeFindFirst.mockResolvedValueOnce({
      id: "emp_ama_002",
      phone: "+233200999888",
      firstName: "Ama",
      lastName: "Osei",
      status: "ACTIVE",
    });

    const requestResult = await requestMobileOtp("0200999888");
    expect(requestResult.ok).toBe(true);

    mockEmployeeFindUnique.mockResolvedValueOnce({
      id: "emp_ama_002",
      employeeCode: "BAS-ACC-002",
      firstName: "Ama",
      lastName: "Osei",
      phone: "+233200999888",
      status: "ACTIVE",
      branchAssignments: [],
    });

    // Device is already bound to Kwame
    mockDeviceFindFirst.mockResolvedValueOnce({
      id: "dev_identity_kwame",
      employeeId: "emp_kwame_001",
      externalId: "shared_hardware_uuid_123",
      revokedAt: null,
    });

    const verifyResult = await verifyMobileOtp({
      phone: "0200999888",
      code: requestResult.debugOtp!,
      challengeToken: requestResult.challengeToken!,
      deviceId: "shared_hardware_uuid_123",
    });

    expect(verifyResult.ok).toBe(false);
    expect(verifyResult.error).toBe("DEVICE_BOUND_TO_OTHER");
    expect(verifyResult.message).toContain("This device is registered to another employee");
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "security.device_binding_conflict",
        entityId: "emp_ama_002",
      })
    );
  });

  it("rejects login when employee already has another active phone registered (1 Staff Member -> 1 Phone)", async () => {
    mockEmployeeFindFirst.mockResolvedValueOnce({
      id: "emp_kwame_001",
      phone: "+233244111222",
      firstName: "Kwame",
      lastName: "Mensah",
      status: "ACTIVE",
    });

    const requestResult = await requestMobileOtp("0244111222");
    expect(requestResult.ok).toBe(true);

    mockEmployeeFindUnique.mockResolvedValueOnce({
      id: "emp_kwame_001",
      employeeCode: "BAS-ACC-001",
      firstName: "Kwame",
      lastName: "Mensah",
      phone: "+233244111222",
      status: "ACTIVE",
      branchAssignments: [],
    });

    // Check 1: Device is not bound to another employee
    mockDeviceFindFirst.mockResolvedValueOnce(null);
    // Check 2: Kwame already has an active phone registered with a different deviceId
    mockDeviceFindFirst.mockResolvedValueOnce({
      id: "dev_identity_kwame_phone1",
      employeeId: "emp_kwame_001",
      externalId: "kwame_first_hardware_uuid",
      revokedAt: null,
    });

    const verifyResult = await verifyMobileOtp({
      phone: "0244111222",
      code: requestResult.debugOtp!,
      challengeToken: requestResult.challengeToken!,
      deviceId: "kwame_second_hardware_uuid",
    });

    expect(verifyResult.ok).toBe(false);
    expect(verifyResult.error).toBe("EMPLOYEE_ALREADY_BOUND");
    expect(verifyResult.message).toContain("already bound to another phone");
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "security.employee_multi_device_attempt",
        entityId: "emp_kwame_001",
      })
    );
  });

  it("normalizes Ghana phone numbers with formatGhanaTel", async () => {
    const { formatGhanaTel } = await import("@/lib/platform/sms");
    expect(formatGhanaTel("+233542958451")).toBe("0542958451");
    expect(formatGhanaTel("233542958451")).toBe("0542958451");
    expect(formatGhanaTel("0542958451")).toBe("0542958451");
    expect(formatGhanaTel("542958451")).toBe("0542958451");
    expect(formatGhanaTel("054 295 8451")).toBe("0542958451");
  });

  it("passes custom overrides (name, email, code) to OTP request", async () => {
    mockEmployeeFindFirst.mockResolvedValueOnce({
      id: "emp_augustine_01",
      phone: "+233542958451",
      firstName: "Augustine",
      lastName: "Cobbold",
      email: "augustinecobbold6@gmail.com",
      employeeCode: "BAS-ACC-099",
      status: "ACTIVE",
    });

    const result = await requestMobileOtp("0542958451", {
      name: "Augustine",
      email: "augustinecobbold6@gmail.com",
      code: "MF7890",
    });

    expect(result.ok).toBe(true);
    expect(result.challengeToken).toBeDefined();
    expect(result.debugOtp).toBeDefined();
  });
});
