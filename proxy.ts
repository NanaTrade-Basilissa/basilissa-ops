import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/modules/identity/constants";

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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_ADMIN_PATHS.some((path) => pathname.startsWith(path));
  const isProtected = !isPublic && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!isProtected) {
    return NextResponse.next();
  }

  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!hasSessionCookie) {
    if (pathname.startsWith("/api/admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
