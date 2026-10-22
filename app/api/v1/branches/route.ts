import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { scoped } from "@/lib/platform/logger";
import { rateLimit, getClientIp } from "@/lib/platform/rate-limit";

const log = scoped("api:branches");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    try {
      const limit = await rateLimit(`public-branches:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
      if (!limit.success) {
        return NextResponse.json(
          {
            ok: false,
            error: "RATE_LIMITED",
            message: "Too many requests. Please try again shortly.",
          },
          {
            status: 429,
            headers: {
              ...CORS_HEADERS,
              "Retry-After": Math.ceil((limit.resetAt - Date.now()) / 1000).toString(),
            },
          },
        );
      }
    } catch (rlError) {
      log.warn("Rate limit check failed, allowing request", { error: rlError });
    }

    const { searchParams } = request.nextUrl;
    const includeInactive =
      searchParams.get("includeInactive") === "true" ||
      searchParams.get("all") === "true";
    const slug = searchParams.get("slug")?.trim();
    const search = searchParams.get("search")?.trim();

    const where: Prisma.BranchWhereInput = {};

    if (!includeInactive) {
      where.isActive = true;
    }

    if (slug) {
      where.slug = slug.toLowerCase();
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { location: { contains: search, mode: "insensitive" } },
      ];
    }

    const rawBranches = await prisma.branch.findMany({
      where,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        location: true,
        isActive: true,
        latitude: true,
        longitude: true,
        geofenceRadiusMeters: true,
        timezone: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const branches = rawBranches.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      location: b.location,
      address: b.location,
      latitude: b.latitude,
      longitude: b.longitude,
      geofenceRadiusMeters: b.geofenceRadiusMeters,
      timezone: b.timezone,
      isActive: b.isActive,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    }));

    return NextResponse.json(
      {
        ok: true,
        count: branches.length,
        branches,
        data: branches,
      },
      {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    log.error("Failed to fetch branches", { error });
    return NextResponse.json(
      {
        ok: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to retrieve branches.",
      },
      {
        status: 500,
        headers: CORS_HEADERS,
      },
    );
  }
}
