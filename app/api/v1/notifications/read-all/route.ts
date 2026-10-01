import { NextResponse, type NextRequest } from "next/server";
import { markAllInboxRead } from "@/lib/platform/inbox";
import { authenticateInboxRequest } from "../auth";

/**
 * POST /api/v1/notifications/read-all: marks everything read, or only
 * announcements with `{ "kind": "announcement" }`.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateInboxRequest(request, "inbox-read-all");
  if (!auth.ok) return auth.response;

  const body: unknown = await request.json().catch(() => ({}));
  const kind =
    body && typeof body === "object" && "kind" in body && (body as { kind?: unknown }).kind === "announcement"
      ? "announcement"
      : "all";

  const updated = await markAllInboxRead(auth.employeeId, kind);
  return NextResponse.json({ ok: true, updated });
}
