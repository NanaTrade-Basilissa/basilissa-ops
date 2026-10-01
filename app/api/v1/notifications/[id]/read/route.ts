import { NextResponse, type NextRequest } from "next/server";
import { markInboxRead } from "@/lib/platform/inbox";
import { authenticateInboxRequest } from "../../auth";

/**
 * POST /api/v1/notifications/{id}/read: marks one notice read.
 *
 * Idempotent. An id that is not the caller's answers 404, the same as one that
 * does not exist, so ids cannot be probed.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateInboxRequest(request, "inbox-read");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const found = await markInboxRead(auth.employeeId, id);
  if (!found) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND", message: "Notification not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
