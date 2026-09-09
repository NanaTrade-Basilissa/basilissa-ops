import { describe, expect, it, vi, beforeEach } from "vitest";
import { SignJWT } from "jose";
import { UserStatus } from "@prisma/client";
import { TRUSTED_DEVICE_COOKIE_NAME } from "@/lib/modules/identity/constants";

const cookieMap = new Map<string, { value: string; options?: unknown }>();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const entry = cookieMap.get(name);
      return entry ? { value: entry.value } : undefined;
    },
    set: (name: string, value: string, options?: unknown) => {
      cookieMap.set(name, { value, options });
    },
    delete: (name: string) => {
      cookieMap.delete(name);
    },
  })),
}));

const mockFindUnique = vi.fn();
vi.mock("@/lib/platform/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

const { trustDevice, isDeviceTrusted } = await import("@/lib/modules/identity/session");

function getKey() {
  return new TextEncoder().encode(process.env.SESSION_SECRET);
}

describe("MFA Trusted Device", () => {
  beforeEach(() => {
    cookieMap.clear();
    mockFindUnique.mockReset();
  });

  it("trustDevice sets the trusted device cookie for 30 days", async () => {
    mockFindUnique.mockResolvedValueOnce({ sessionVersion: 2 });

    await trustDevice("user_123");

    const cookie = cookieMap.get(TRUSTED_DEVICE_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBeTruthy();

    const options = cookie?.options as { httpOnly: boolean; sameSite: string; expires: Date };
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.expires.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
  });

  it("isDeviceTrusted returns true when cookie is valid and sessionVersion matches", async () => {
    mockFindUnique.mockResolvedValueOnce({ sessionVersion: 2 });
    await trustDevice("user_123");

    mockFindUnique.mockResolvedValueOnce({ sessionVersion: 2, status: UserStatus.ACTIVE });

    const trusted = await isDeviceTrusted("user_123");
    expect(trusted).toBe(true);
  });

  it("isDeviceTrusted returns false when no cookie is present", async () => {
    const trusted = await isDeviceTrusted("user_123");
    expect(trusted).toBe(false);
  });

  it("isDeviceTrusted returns false when sessionVersion was bumped (e.g. password reset)", async () => {
    mockFindUnique.mockResolvedValueOnce({ sessionVersion: 2 });
    await trustDevice("user_123");

    // Database now has sessionVersion 3 (invalidating old trusted devices)
    mockFindUnique.mockResolvedValueOnce({ sessionVersion: 3, status: UserStatus.ACTIVE });

    const trusted = await isDeviceTrusted("user_123");
    expect(trusted).toBe(false);
  });

  it("isDeviceTrusted returns false when account is suspended or terminated", async () => {
    mockFindUnique.mockResolvedValueOnce({ sessionVersion: 2 });
    await trustDevice("user_123");

    mockFindUnique.mockResolvedValueOnce({ sessionVersion: 2, status: UserStatus.SUSPENDED });

    const trusted = await isDeviceTrusted("user_123");
    expect(trusted).toBe(false);
  });

  it("isDeviceTrusted returns false for another user ID", async () => {
    mockFindUnique.mockResolvedValueOnce({ sessionVersion: 2 });
    await trustDevice("user_123");

    const trusted = await isDeviceTrusted("user_456");
    expect(trusted).toBe(false);
  });

  it("isDeviceTrusted returns false when token is expired", async () => {
    const expiredToken = await new SignJWT({ trustedDevice: true, sv: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user_123")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 40 * 86400)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10 * 86400)
      .sign(getKey());

    cookieMap.set(TRUSTED_DEVICE_COOKIE_NAME, { value: expiredToken });

    const trusted = await isDeviceTrusted("user_123");
    expect(trusted).toBe(false);
  });
});
