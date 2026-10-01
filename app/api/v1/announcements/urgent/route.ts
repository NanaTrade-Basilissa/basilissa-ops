import { NextResponse, type NextRequest } from "next/server";
import { getActiveUrgentBanner } from "@/lib/modules/announcements/server";
import { authenticateInboxRequest } from "../../notifications/auth";

/**
 * GET /api/v1/announcements/urgent: the urgent banner to show this employee, or
 * `banner: null`. At most one is active at a time.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateInboxRequest(request, "banner");
  if (!auth.ok) return auth.response;
  return NextResponse.json({ ok: true, banner: await getActiveUrgentBanner(auth.employeeId) });
}
