import { NextResponse, type NextRequest } from "next/server";
import { acknowledgeAnnouncement } from "@/lib/modules/announcements/server";
import { authenticateInboxRequest } from "../../../notifications/auth";

/**
 * POST /api/v1/announcements/{id}/ack: "I've read this".
 *
 * Idempotent: acknowledging twice keeps the first time. 404 for an announcement
 * the caller did not receive (the same as one that does not exist), 409 when the
 * announcement did not ask for acknowledgement.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateInboxRequest(request, "announcement-ack");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const result = await acknowledgeAnnouncement(auth.employeeId, id);
  if (result === "NOT_FOUND") {
    return NextResponse.json({ ok: false, error: "NOT_FOUND", message: "Announcement not found." }, { status: 404 });
  }
  if (result === "NOT_REQUIRED") {
    return NextResponse.json(
      { ok: false, error: "ACK_NOT_REQUIRED", message: "This announcement does not need confirmation." },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, alreadyAcknowledged: result === "ALREADY" });
}
