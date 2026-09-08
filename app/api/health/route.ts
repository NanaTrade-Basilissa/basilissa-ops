import { NextResponse } from "next/server";
import { prisma } from "@/lib/platform/prisma";
import { scoped } from "@/lib/platform/logger";

/**
 * Liveness + database-connectivity check, used by the Docker Compose
 * healthcheck for the `app` service. Deliberately unauthenticated (it
 * reveals nothing except "the process and its DB connection are up") so
 * it can be probed from inside the container without credentials.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    scoped("health").error("database check failed", { error });
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
