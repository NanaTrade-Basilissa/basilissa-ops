import { NextResponse, type NextRequest } from "next/server";
import { listInbox, INBOX_DEFAULT_LIMIT } from "@/lib/platform/inbox";
import { loadAnnouncementFlags } from "@/lib/modules/announcements/server";
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

  // Announcement items say whether they ask for "I've read this" and whether the
  // caller has given it, so the app can show the button.
  const flags = await loadAnnouncementFlags(
    auth.employeeId,
    items.flatMap((item) => (item.announcementId ? [item.announcementId] : [])),
  );
  const annotated = items.map((item) => {
    const flag = item.announcementId ? flags.get(item.announcementId) : undefined;
    return flag ? { ...item, urgent: flag.urgent, ackRequired: flag.requiresAck, acknowledged: flag.acknowledged } : item;
  });

  return NextResponse.json({ ok: true, items: annotated, nextCursor });
}
