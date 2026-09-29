import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockEmployeeFindFirst = vi.fn();
const mockEmployeeFindUnique = vi.fn();
const mockDeviceFindFirst = vi.fn();
const mockDeviceCreate = vi.fn();
const mockRecordAudit = vi.fn();
const mockDispatchOtp = vi.fn();

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
    },
  },
}));

vi.mock("@/lib/platform/sms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform/sms")>()),
  dispatchOtpViaGateway: (...args: unknown[]) => mockDispatchOtp(...args),
}));

const { requestMobileOtp, verifyMobileOtp } = await import("@/lib/modules/attendance/mobile-auth");
const { getReviewDemoConfig, isReviewDemoLogin, isReviewDemoPhone } = await import(
  "@/lib/modules/attendance/review-demo"
);

const DEMO_PHONE = "+233000000001";
const DEMO_OTP = "482913";

const demoEmployee = {
  id: "emp_demo",
  employeeCode: "APPREVIEW",
  firstName: "Demo",
  lastName: "Reviewer",
  phone: DEMO_PHONE,
  email: null,
  jobTitle: "App store reviewer",
  status: "ACTIVE",
  branchAssignments: [],
};

describe("review demo config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled unless both variables are set", () => {
    expect(getReviewDemoConfig()).toBeNull();
    vi.stubEnv("REVIEW_DEMO_PHONE", DEMO_PHONE);
    expect(getReviewDemoConfig()).toBeNull();
    vi.stubEnv("REVIEW_DEMO_PHONE", "");
    vi.stubEnv("REVIEW_DEMO_OTP", DEMO_OTP);
    expect(getReviewDemoConfig()).toBeNull();
  });

  it("is disabled when the code is not exactly 6 digits", () => {
    vi.stubEnv("REVIEW_DEMO_PHONE", DEMO_PHONE);
    for (const bad of ["12345", "1234567", "abcdef", "12 456"]) {
      vi.stubEnv("REVIEW_DEMO_OTP", bad);
      expect(getReviewDemoConfig()).toBeNull();
    }
  });

  it("matches the phone in any format, and the code exactly", () => {
    vi.stubEnv("REVIEW_DEMO_PHONE", DEMO_PHONE);
    vi.stubEnv("REVIEW_DEMO_OTP", DEMO_OTP);

    expect(isReviewDemoPhone("+233000000001")).toBe(true);
    expect(isReviewDemoPhone("0000000001")).toBe(true);
    expect(isReviewDemoPhone("+233244111222")).toBe(false);
    expect(isReviewDemoPhone(null)).toBe(false);

    expect(isReviewDemoLogin(DEMO_PHONE, DEMO_OTP)).toBe(true);
    expect(isReviewDemoLogin(DEMO_PHONE, "000000")).toBe(false);
    expect(isReviewDemoLogin("+233244111222", DEMO_OTP)).toBe(false);
  });
});

describe("review demo login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("REVIEW_DEMO_PHONE", DEMO_PHONE);
    vi.stubEnv("REVIEW_DEMO_OTP", DEMO_OTP);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("request skips the SMS gateway and leaks no debug code", async () => {
    mockEmployeeFindFirst.mockResolvedValueOnce(demoEmployee);

    const result = await requestMobileOtp(DEMO_PHONE);

    expect(result.ok).toBe(true);
    expect(result.challengeToken).toBeDefined();
    expect(result.debugOtp).toBeUndefined();
    expect(mockDispatchOtp).not.toHaveBeenCalled();
  });

  it("verify accepts the fixed code with no challenge, never binds a device", async () => {
    mockEmployeeFindFirst.mockResolvedValueOnce({ id: "emp_demo" });
    mockEmployeeFindUnique.mockResolvedValueOnce(demoEmployee);
    // Even a device bound to another employee, and a different device bound
    // to this one, must not block the demo account.
    mockDeviceFindFirst
      .mockResolvedValueOnce({ employeeId: "emp_real", externalId: "phone_x" })
      .mockResolvedValueOnce({ employeeId: "emp_demo", externalId: "phone_y" });

    const result = await verifyMobileOtp({
      phone: DEMO_PHONE,
      code: DEMO_OTP,
      deviceId: "phone_x",
    });

    expect(result.ok).toBe(true);
    expect(result.deviceToken).toBeDefined();
    expect(mockDeviceCreate).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it("verify still rejects a wrong code for the demo phone", async () => {
    const result = await verifyMobileOtp({ phone: DEMO_PHONE, code: "000000", deviceId: "d" });
    expect(result.ok).toBe(false);
    expect(result.deviceToken).toBeUndefined();
  });

  it("verify does not accept the demo code for a real employee", async () => {
    const result = await verifyMobileOtp({
      phone: "+233244111222",
      code: DEMO_OTP,
      deviceId: "d",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("INVALID_CHALLENGE");
  });

  it("real employees still go through the SMS gateway and are device-bound", async () => {
    mockEmployeeFindFirst.mockResolvedValueOnce({
      id: "emp_kwame",
      firstName: "Kwame",
      lastName: "Mensah",
      phone: "+233244111222",
      status: "ACTIVE",
    });
    mockDispatchOtp.mockResolvedValueOnce({ ok: true, otp: "111111" });

    const requestResult = await requestMobileOtp("0244111222");
    expect(requestResult.ok).toBe(true);
    expect(mockDispatchOtp).toHaveBeenCalledTimes(1);

    mockEmployeeFindUnique.mockResolvedValueOnce({
      ...demoEmployee,
      id: "emp_kwame",
      phone: "+233244111222",
    });
    mockDeviceFindFirst
      .mockResolvedValueOnce({ employeeId: "emp_other", externalId: "phone_x" })
      .mockResolvedValueOnce(null);

    const result = await verifyMobileOtp({
      phone: "0244111222",
      code: "111111",
      challengeToken: requestResult.challengeToken,
      deviceId: "phone_x",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("DEVICE_BOUND_TO_OTHER");
  });
});
