import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getEnv, _resetEnvCache } from "@/lib/platform/env";

describe("env configuration and fallbacks", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    _resetEnvCache();
    process.env = { ...originalEnv };
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
    process.env.SESSION_SECRET = "test-session-secret-at-least-32-characters-long";
  });

  afterEach(() => {
    _resetEnvCache();
    process.env = { ...originalEnv };
  });

  it("uses NEXT_PUBLIC_APP_URL directly and strips trailing slashes", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.basilissa.com///";
    const env = getEnv();
    expect(env.NEXT_PUBLIC_APP_URL).toBe("https://app.basilissa.com");
  });

  it("auto-prefixes https:// if protocol is omitted from NEXT_PUBLIC_APP_URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "feedback.basilissa.com";
    const env = getEnv();
    expect(env.NEXT_PUBLIC_APP_URL).toBe("https://feedback.basilissa.com");
  });

  it("falls back to APP_URL if NEXT_PUBLIC_APP_URL is unset", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.APP_URL = "https://custom-app.basilissa.com";
    const env = getEnv();
    expect(env.NEXT_PUBLIC_APP_URL).toBe("https://custom-app.basilissa.com");
  });

  it("falls back to APP_URL if NEXT_PUBLIC_APP_URL is empty whitespace", () => {
    process.env.NEXT_PUBLIC_APP_URL = "   ";
    process.env.APP_URL = "https://custom-app.basilissa.com/";
    const env = getEnv();
    expect(env.NEXT_PUBLIC_APP_URL).toBe("https://custom-app.basilissa.com");
  });

  it("falls back to VERCEL_PROJECT_PRODUCTION_URL when APP_URL is unset", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "feedback-production.vercel.app";
    const env = getEnv();
    expect(env.NEXT_PUBLIC_APP_URL).toBe("https://feedback-production.vercel.app");
  });

  it("falls back to VERCEL_URL when VERCEL_PROJECT_PRODUCTION_URL is unset", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    process.env.VERCEL_URL = "feedback-deployment-123.vercel.app";
    const env = getEnv();
    expect(env.NEXT_PUBLIC_APP_URL).toBe("https://feedback-deployment-123.vercel.app");
  });

  it("falls back to RAILWAY_PUBLIC_DOMAIN when other platform vars are unset", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    process.env.RAILWAY_PUBLIC_DOMAIN = "basilissa-web.up.railway.app";
    const env = getEnv();
    expect(env.NEXT_PUBLIC_APP_URL).toBe("https://basilissa-web.up.railway.app");
  });

  it("gracefully falls back to localhost if no URL variables exist at all", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    delete process.env.RAILWAY_PUBLIC_DOMAIN;
    process.env.PORT = "4000";

    const env = getEnv();
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:4000");
  });

  it("warns in production when falling back to localhost", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    delete process.env.RAILWAY_PUBLIC_DOMAIN;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = getEnv();
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("NEXT_PUBLIC_APP_URL is not configured in production"),
    );
    warnSpy.mockRestore();
  });

  it("throws if truly essential secrets like DATABASE_URL or SESSION_SECRET are missing", () => {
    delete process.env.DATABASE_URL;
    expect(() => getEnv()).toThrow("DATABASE_URL: Required");
  });
});
