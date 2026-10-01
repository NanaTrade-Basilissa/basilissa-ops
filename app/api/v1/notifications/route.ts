import { NextResponse, type NextRequest } from "next/server";
import { listInbox, INBOX_DEFAULT_LIMIT } from "@/lib/platform/inbox";
import { authenticateInboxRequest } from "./auth";

/**
 * GET /api/v1/notifications?kind=all|announcement&limit=&cursor=
 *
 * The staff inbox, newest first. `kind=announcement` is the Announcements tab,
 * `kind=all` (the default) is every notice. Pass `nextCursor` back as `cursor`
 * for the next page.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateInboxRequest(request, "inbox-list");
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;
  const kindParam = params.get("kind") ?? "all";
  if (kindParam !== "all" && kindParam !== "announcement") {
    return NextResponse.json(
      { ok: false, error: "INVALID_KIND", message: "kind must be 'all' or 'announcement'." },
      { status: 400 },
    );
  }

  const rawLimit = Number.parseInt(params.get("limit") ?? String(INBOX_DEFAULT_LIMIT), 10);
  const { items, nextCursor } = await listInbox(auth.employeeId, {
    kind: kindParam,
    limit: Number.isNaN(rawLimit) ? INBOX_DEFAULT_LIMIT : rawLimit,
    cursor: params.get("cursor"),
  });

  return NextResponse.json({ ok: true, items, nextCursor });
}
