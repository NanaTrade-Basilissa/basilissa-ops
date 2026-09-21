import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  SESSION_REFRESH_THRESHOLD_MS,
} from "@/lib/modules/identity/constants";

// Next.js 16 renamed `middleware.ts` to `proxy.ts` (the exported function
// is renamed the same way). This only does an *optimistic* check — is
// there a session cookie at all — so protected pages redirect instantly
// without a database/JWT round trip on every request. The real
// verification (is the JWT valid, not expired, not tampered with) happens
// in the Data Access Layer (lib/auth/dal.ts), which every admin page,
// layout and server action calls. See Next.js's authentication guide,
// "Optimistic checks with Proxy".
const PROTECTED_PREFIXES = ["/admin", "/api/admin"];
/**
 * Reachable without a session, and they have to be: everything here is for
 * someone who cannot sign in. Anything under /admin missing from this list is
 * redirected to the login page, which for a password reset means the feature
 * silently does not exist.
 *
 * Prefix matches, so /admin/login also covers the MFA challenge beneath it.
 */
const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/forgot-password", "/admin/reset-password"];

/**
 * Optimistically inspects the session token. If the signature is valid and
 * less than 6 days remain on its 7-day lifetime, produces a refreshed token
 * with an updated expiration. Returns null if invalid, expired, or not due for refresh.
 */
function tryRefreshSessionCookie(rawCookie: string, secret: string): string | null {
  try {
    const parts = rawCookie.split(".");
    if (parts.length !== 3) return null;

    const data = `${parts[0]}.${parts[1]}`;
    const expectedSig = createHmac("sha256", secret).update(data).digest("base64url");
    if (parts[2].length !== expectedSig.length) return null;
    if (!timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expectedSig))) return null;

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!payload.exp || !payload.sub || !payload.sid || typeof payload.sv !== "number") return null;

    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp <= nowSec) return null;

    const secRemaining = payload.exp - nowSec;
    const refreshThresholdSec = Math.floor(SESSION_REFRESH_THRESHOLD_MS / 1000);
    const sessionDurationSec = Math.floor(SESSION_DURATION_MS / 1000);

    // Only refresh if within the sliding refresh threshold (active > 1 day since last issue)
    if (secRemaining > sessionDurationSec - refreshThresholdSec) {
      return null;
    }

    const newPayload = {
      ...payload,
      iat: nowSec,
      exp: nowSec + sessionDurationSec,
    };

    const newHeaderB64 = parts[0];
    const newPayloadB64 = Buffer.from(JSON.stringify(newPayload)).toString("base64url");
    const newData = `${newHeaderB64}.${newPayloadB64}`;
    const newSigB64 = createHmac("sha256", secret).update(newData).digest("base64url");

    return `${newData}.${newSigB64}`;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_ADMIN_PATHS.some((path) => pathname.startsWith(path));
  const isProtected = !isPublic && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!isProtected) {
    return NextResponse.next();
  }

  const rawCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!rawCookie) {
    if (pathname.startsWith("/api/admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const secret = process.env.SESSION_SECRET;
  if (secret) {
    const refreshedToken = tryRefreshSessionCookie(rawCookie, secret);
    if (refreshedToken) {
      const response = NextResponse.next();
      response.cookies.set(SESSION_COOKIE_NAME, refreshedToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        expires: new Date(Date.now() + SESSION_DURATION_MS),
        maxAge: Math.floor(SESSION_DURATION_MS / 1000),
        path: "/",
      });
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
