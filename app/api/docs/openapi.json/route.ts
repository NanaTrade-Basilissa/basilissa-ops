import { NextResponse } from "next/server";
import { OPENAPI_SPEC } from "@/lib/platform/openapi-spec";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(OPENAPI_SPEC, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
