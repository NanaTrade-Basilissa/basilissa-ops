import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizePhoneNumber, sendSms } from "@/lib/platform/sms";
import { seal, open } from "@/lib/platform/secret-box";
import { OPENAPI_SPEC } from "@/lib/platform/openapi-spec";
import { _resetEnvCache } from "@/lib/platform/env";
import { createDeviceToken, verifyDeviceToken } from "@/lib/modules/attendance/server";

describe("Phone number normalization", () => {
  it("normalizes local 10-digit Ghana numbers with leading 0 to +233", () => {
    expect(normalizePhoneNumber("0241234567")).toBe("+233241234567");
    expect(normalizePhoneNumber("0509876543")).toBe("+233509876543");
    expect(normalizePhoneNumber("0551122334")).toBe("+233551122334");
  });

  it("strips whitespace, dashes, and parentheses", () => {
    expect(normalizePhoneNumber("024 123 4567")).toBe("+233241234567");
    expect(normalizePhoneNumber("(024) 123-4567")).toBe("+233241234567");
    expect(normalizePhoneNumber("+233 24 123 4567")).toBe("+233241234567");
  });

  it("preserves international numbers already with + prefix", () => {
    expect(normalizePhoneNumber("+233241234567")).toBe("+233241234567");
    expect(normalizePhoneNumber("+14155552671")).toBe("+14155552671");
  });

  it("prepends plus if starting with 233 without plus", () => {
    expect(normalizePhoneNumber("233241234567")).toBe("+233241234567");
  });
});

describe("SMS delivery service", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    _resetEnvCache();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    _resetEnvCache();
  });

  it("simulates SMS dispatch when SMS_GATEWAY_URL is unset", async () => {
    delete process.env.SMS_GATEWAY_URL;
    _resetEnvCache();
    const result = await sendSms({
      recipient: "0241234567",
      message: "Your code is 1234",
    });

    expect(result.ok).toBe(true);
    expect(result.simulated).toBe(true);
  });

  it("dispatches HTTP request without Authorization header when SMS_GATEWAY_AUTH_TOKEN is empty", async () => {
    process.env.SMS_GATEWAY_URL = "https://sms.example.com/api/send";
    delete process.env.SMS_GATEWAY_AUTH_TOKEN;
    _resetEnvCache();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "msg_123" }),
    });
    global.fetch = mockFetch;

    const result = await sendSms({
      recipient: "0241234567",
      message: "Your verification code is 5566",
    });

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://sms.example.com/api/send");
    expect(init.headers["Authorization"]).toBeUndefined();
    expect(init.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body as string);
    expect(body.recipient).toBe("+233241234567");
    expect(body.message).toContain("5566");
  });

  it("attaches Authorization header when SMS_GATEWAY_AUTH_TOKEN is provided", async () => {
    process.env.SMS_GATEWAY_URL = "https://sms.example.com/api/send";
    process.env.SMS_GATEWAY_AUTH_TOKEN = "secret_sms_key_7788";
    _resetEnvCache();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: "msg_456" }),
    });
    global.fetch = mockFetch;

    const result = await sendSms({
      recipient: "+233241234567",
      message: "Your code is 9988",
    });

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers["Authorization"]).toBe("Bearer secret_sms_key_7788");
  });
});

describe("Challenge token encryption & verification", () => {
  it("seals and opens challenge payloads with tamper resistance", () => {
    const payload = {
      employeeId: "emp_123",
      phone: "+233241234567",
      codeHash: "a1b2c3d4",
      expiresAt: Date.now() + 300000,
    };

    const token = seal(JSON.stringify(payload), "mobile-otp");
    expect(token).toBeTypeOf("string");
    expect(token.split(".")).toHaveLength(3);

    const decryptedJson = open(token, "mobile-otp");
    const decrypted = JSON.parse(decryptedJson);
    expect(decrypted.employeeId).toBe(payload.employeeId);
    expect(decrypted.phone).toBe(payload.phone);
    expect(decrypted.codeHash).toBe(payload.codeHash);
  });

  it("throws when opening with a mismatched purpose", () => {
    const token = seal("hello world", "purpose-a");
    expect(() => open(token, "purpose-b")).toThrow();
  });

  it("throws when opening a tampered ciphertext", () => {
    const token = seal("secret", "mobile-otp");
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}bad.${parts[2]}`;
    expect(() => open(tampered, "mobile-otp")).toThrow();
  });
});

describe("OpenAPI documentation for mobile auth", () => {
  it("documents /api/v1/auth/mobile/otp/request and /api/v1/auth/mobile/otp/verify", () => {
    const paths = OPENAPI_SPEC.paths;
    expect(paths["/api/v1/auth/mobile/otp/request"]).toBeDefined();
    expect(paths["/api/v1/auth/mobile/otp/request"].post).toBeDefined();
    expect(paths["/api/v1/auth/mobile/otp/request"].post.tags).toContain("Mobile Authentication");

    expect(paths["/api/v1/auth/mobile/otp/verify"]).toBeDefined();
    expect(paths["/api/v1/auth/mobile/otp/verify"].post).toBeDefined();
    expect(paths["/api/v1/auth/mobile/otp/verify"].post.tags).toContain("Mobile Authentication");
  });

  it("defines schemas for MobileOtpRequestInput, VerifyInput, and Responses", () => {
    const schemas = OPENAPI_SPEC.components.schemas;
    expect(schemas.MobileOtpRequestInput).toBeDefined();
    expect(schemas.MobileOtpRequestResponse).toBeDefined();
    expect(schemas.MobileOtpVerifyInput).toBeDefined();
    expect(schemas.MobileOtpVerifyResponse).toBeDefined();

    expect(schemas.MobileOtpVerifyInput.required).toContain("phone");
    expect(schemas.MobileOtpVerifyInput.required).toContain("code");
    expect(schemas.MobileOtpVerifyInput.required).toContain("challengeToken");
    expect(schemas.MobileOtpVerifyInput.required).toContain("deviceId");
  });
});

describe("Device Token Session Verification", () => {
  it("creates and successfully verifies an active 30-day device token", () => {
    const token = createDeviceToken({
      employeeId: "emp_test_100",
      deviceId: "device_pixel_8",
      phone: "+233241234567",
    });

    const verification = verifyDeviceToken(token);
    expect(verification.ok).toBe(true);
    if (verification.ok) {
      expect(verification.payload.employeeId).toBe("emp_test_100");
      expect(verification.payload.deviceId).toBe("device_pixel_8");
      expect(verification.payload.phone).toBe("+233241234567");
    }
  });

  it("rejects missing, blank, or undefined token", () => {
    expect(verifyDeviceToken(null).ok).toBe(false);
    expect(verifyDeviceToken("").ok).toBe(false);
    expect(verifyDeviceToken("   ").ok).toBe(false);
    expect(verifyDeviceToken(undefined).ok).toBe(false);
  });

  it("rejects an expired device token", () => {
    const expiredToken = createDeviceToken({
      employeeId: "emp_test_100",
      deviceId: "device_old",
      phone: "+233241234567",
      expiresInMs: -1000, // expired 1 sec ago
    });

    const verification = verifyDeviceToken(expiredToken);
    expect(verification.ok).toBe(false);
    if (!verification.ok) {
      expect(verification.error).toBe("TOKEN_EXPIRED");
    }
  });

  it("rejects a tampered device token", () => {
    const validToken = createDeviceToken({
      employeeId: "emp_test_100",
      deviceId: "device_xyz",
      phone: "+233241234567",
    });

    const parts = validToken.split(".");
    const tampered = `${parts[0]}.${parts[1]}bad.${parts[2]}`;
    const verification = verifyDeviceToken(tampered);
    expect(verification.ok).toBe(false);
    if (!verification.ok) {
      expect(verification.error).toBe("INVALID_TOKEN");
    }
  });
});

describe("OpenAPI documentation for Attendance Punch Security", () => {
  it("requires DeviceTokenAuth security on /api/v1/attendance/punch", () => {
    const punchOp = OPENAPI_SPEC.paths["/api/v1/attendance/punch"].post;
    expect(punchOp.security).toEqual([{ DeviceTokenAuth: [] }]);
    expect(punchOp.responses["401"]).toBeDefined();
    expect(punchOp.responses["403"]).toBeDefined();
  });

  it("defines DeviceTokenAuth in security schemes", () => {
    const schemes = OPENAPI_SPEC.components.securitySchemes;
    expect(schemes.DeviceTokenAuth).toBeDefined();
    expect(schemes.DeviceTokenAuth.type).toBe("http");
    expect(schemes.DeviceTokenAuth.scheme).toBe("bearer");
  });
});

