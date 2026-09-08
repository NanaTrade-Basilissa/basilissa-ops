import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
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
});
