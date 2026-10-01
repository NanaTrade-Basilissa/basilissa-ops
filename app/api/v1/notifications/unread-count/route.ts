import { NextResponse, type NextRequest } from "next/server";
import { countUnread } from "@/lib/platform/inbox";
import { authenticateInboxRequest } from "../auth";

/** GET /api/v1/notifications/unread-count: the badge, overall and for announcements. */
export async function GET(request: NextRequest) {
  const auth = await authenticateInboxRequest(request, "inbox-unread");
  if (!auth.ok) return auth.response;

  const { total, announcements } = await countUnread(auth.employeeId);
  return NextResponse.json({ ok: true, total, announcements });
}
