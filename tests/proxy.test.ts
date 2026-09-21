import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { proxy } from "@/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/modules/identity/constants";

function makeRequest(path: string, sessionCookie?: string) {
  const request = new NextRequest(`http://localhost:3000${path}`);
  if (sessionCookie) {
    request.cookies.set(SESSION_COOKIE_NAME, sessionCookie);
  }
  return request;
}

describe("proxy (optimistic admin route protection)", () => {
  it("redirects unauthenticated visitors away from /admin to /admin/login", () => {
    const res = proxy(makeRequest("/admin"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/admin/login");
  });

  it("redirects unauthenticated visitors away from nested /admin routes", () => {
    const res = proxy(makeRequest("/admin/branches/123"));
    expect(res.headers.get("location")).toContain("/admin/login");
  });

  it("lets a request with a session cookie through to /admin", () => {
    // proxy.ts only checks the cookie is present — full JWT verification
    // happens in the DAL (lib/auth/dal.ts), so any non-empty value passes
    // this layer by design.
    const res = proxy(makeRequest("/admin", "some-session-jwt"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("never redirects requests to /admin/login itself, even without a cookie", () => {
    const res = proxy(makeRequest("/admin/login"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("returns 401 JSON (not a redirect) for unauthenticated /api/admin requests", () => {
    const res = proxy(makeRequest("/api/admin/branches/abc/qr"));
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
  });

  it("leaves public routes like /feedback untouched", () => {
    const res = proxy(makeRequest("/feedback"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("leaves the public feedback API untouched", () => {
    const res = proxy(makeRequest("/api/feedback"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("slides/refreshes the session cookie when remaining lifetime is under 6 days", async () => {
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET || "default_test_secret_32_characters_long");
    process.env.SESSION_SECRET = process.env.SESSION_SECRET || "default_test_secret_32_characters_long";

    // Token issued 2 days ago with 5 days remaining (< 6 days threshold)
    const token = await new SignJWT({ sid: "sess_slide_1", sv: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user_slide_1")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60)
      .setExpirationTime(Math.floor(Date.now() / 1000) + 5 * 24 * 60 * 60)
      .sign(secret);

    const res = proxy(makeRequest("/admin", token));
    expect(res.headers.get("location")).toBeNull();
    const setCookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(setCookie).toBeDefined();
    expect(setCookie?.value).not.toBe(token); // Refreshed new token!
  });

  it("does not slide a freshly issued session cookie (no redundant cookie churn)", async () => {
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET || "default_test_secret_32_characters_long");
    process.env.SESSION_SECRET = process.env.SESSION_SECRET || "default_test_secret_32_characters_long";

    // Token issued just now with full 7 days remaining
    const token = await new SignJWT({ sid: "sess_fresh_1", sv: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user_fresh_1")
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60)
      .sign(secret);

    const res = proxy(makeRequest("/admin", token));
    expect(res.headers.get("location")).toBeNull();
    const setCookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(setCookie).toBeUndefined(); // Fresh, no need to touch cookie
  });
});
