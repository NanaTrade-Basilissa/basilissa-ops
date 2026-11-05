import { NextResponse, type NextRequest } from "next/server";
import { scoped } from "@/lib/platform/logger";
import { rateLimit, getClientIp } from "@/lib/platform/rate-limit";
import { getUpdateStatus } from "@/lib/modules/releases/server";
import { isValidVersion } from "@/lib/modules/releases/constants";

const log = scoped("api:app-version");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Public on purpose: the app asks this before and after sign-in, and the answer
 * (a version number and release notes) is not sensitive.
 *
 *   GET /api/v1/app-version?platform=ios|android&version=1.2.0
 */
export async function GET(request: NextRequest) {
  try {
    try {
      const limit = await rateLimit(`app-version:${getClientIp(request)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
      if (!limit.success) {
        return NextResponse.json(
          { ok: false, error: "RATE_LIMITED", message: "Too many requests. Please try again shortly." },
          {
            status: 429,
            headers: { ...CORS_HEADERS, "Retry-After": Math.ceil((limit.resetAt - Date.now()) / 1000).toString() },
          },
        );
      }
    } catch (rlError) {
      log.warn("Rate limit check failed, allowing request", { error: rlError });
    }

    const { searchParams } = request.nextUrl;
    const platformParam = searchParams.get("platform")?.trim().toUpperCase();
    const version = searchParams.get("version")?.trim() ?? "";

    if (platformParam !== "IOS" && platformParam !== "ANDROID") {
      return NextResponse.json(
        { ok: false, error: "INVALID_PLATFORM", message: "platform must be ios or android." },
        { status: 400, headers: CORS_HEADERS },
      );
    }
    if (!isValidVersion(version)) {
      return NextResponse.json(
        { ok: false, error: "INVALID_VERSION", message: "version must look like 1.2.0." },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const status = await getUpdateStatus(platformParam, version);
    return NextResponse.json({ ok: true, ...status }, { headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } });
  } catch (error) {
    log.error("app-version lookup failed", { error });
    return NextResponse.json(
      { ok: false, error: "SERVER_ERROR", message: "Could not check for updates." },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
