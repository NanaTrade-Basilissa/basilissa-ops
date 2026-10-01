import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/platform/prisma";
import { createDeviceToken } from "@/lib/modules/attendance/server";
import {
  countUnread,
  createInboxNotifications,
  listInbox,
  markAllInboxRead,
  markInboxRead,
  recordInboxNotification,
} from "@/lib/platform/inbox";
import { GET as listRoute } from "@/app/api/v1/notifications/route";
import { GET as unreadRoute } from "@/app/api/v1/notifications/unread-count/route";
import { POST as readRoute } from "@/app/api/v1/notifications/[id]/read/route";
import { POST as readAllRoute } from "@/app/api/v1/notifications/read-all/route";

// The limiter talks to Postgres and fails open when it cannot; keep this suite
// hermetic rather than letting every request attempt a connection.
vi.mock("@/lib/platform/rate-limit", () => ({
  // A plain function, not vi.fn(): restoreAllMocks would wipe a vi.fn's implementation.
  rateLimit: async () => ({ success: true, resetAt: 0 }),
  getClientIp: () => "test",
}));

const token = createDeviceToken({ employeeId: "emp_1", deviceId: "dev_1", phone: "+233241234567" });
const authed = { headers: { Authorization: `Bearer ${token}` } };

function row(id: string, readAt: Date | null = null, kind = "ANNOUNCEMENT") {
  return {
    id,
    kind,
    title: `Title ${id}`,
    body: "Body",
    data: null,
    announcementId: kind === "ANNOUNCEMENT" ? "ann_1" : null,
    readAt,
    createdAt: new Date("2026-10-01T09:00:00.000Z"),
  };
}

describe("inbox helpers", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("lists the caller's inbox only, newest first, one page at a time", async () => {
    const find = vi.spyOn(prisma.notification, "findMany").mockResolvedValueOnce([row("n3"), row("n2"), row("n1")] as never);

    const page = await listInbox("emp_1", { limit: 2 });

    expect(find.mock.calls[0]![0]).toMatchObject({
      where: { employeeId: "emp_1" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 3,
    });
    expect(page.items.map((i) => i.id)).toEqual(["n3", "n2"]);
    expect(page.nextCursor).toBe("n2");
  });

  it("has no next cursor on the last page", async () => {
    vi.spyOn(prisma.notification, "findMany").mockResolvedValueOnce([row("n1")] as never);
    const page = await listInbox("emp_1", { limit: 5 });
    expect(page.nextCursor).toBeNull();
  });

  it("continues after the cursor", async () => {
    const find = vi.spyOn(prisma.notification, "findMany").mockResolvedValueOnce([] as never);
    await listInbox("emp_1", { cursor: "n2" });
    expect(find.mock.calls[0]![0]).toMatchObject({ cursor: { id: "n2" }, skip: 1 });
  });

  it("filters the Announcements tab by kind and clamps a silly limit", async () => {
    const find = vi.spyOn(prisma.notification, "findMany").mockResolvedValue([] as never);
    await listInbox("emp_1", { kind: "announcement", limit: 10_000 });
    expect(find.mock.calls[0]![0]).toMatchObject({ where: { employeeId: "emp_1", kind: "ANNOUNCEMENT" }, take: 101 });
  });

  it("counts unread overall and for announcements", async () => {
    const count = vi.spyOn(prisma.notification, "count").mockResolvedValueOnce(4).mockResolvedValueOnce(1);
    expect(await countUnread("emp_1")).toEqual({ total: 4, announcements: 1 });
    expect(count.mock.calls[0]![0]!.where).toEqual({ employeeId: "emp_1", readAt: null });
    expect(count.mock.calls[1]![0]!.where).toEqual({ employeeId: "emp_1", readAt: null, kind: "ANNOUNCEMENT" });
  });

  it("marks read only for the owner, and keeps the first read time", async () => {
    vi.spyOn(prisma.notification, "findFirst").mockResolvedValueOnce({ id: "n1" } as never);
    const update = vi.spyOn(prisma.notification, "updateMany").mockResolvedValue({ count: 1 } as never);

    expect(await markInboxRead("emp_1", "n1")).toBe(true);
    expect(update.mock.calls[0]![0]).toMatchObject({ where: { id: "n1", employeeId: "emp_1", readAt: null } });
  });

  it("reports someone else's notification as not found", async () => {
    vi.spyOn(prisma.notification, "findFirst").mockResolvedValueOnce(null as never);
    const update = vi.spyOn(prisma.notification, "updateMany");
    expect(await markInboxRead("emp_1", "someone-elses")).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("mark-all can be limited to announcements", async () => {
    const update = vi.spyOn(prisma.notification, "updateMany").mockResolvedValue({ count: 3 } as never);
    expect(await markAllInboxRead("emp_1", "announcement")).toBe(3);
    expect(update.mock.calls[0]![0]!.where).toEqual({ employeeId: "emp_1", readAt: null, kind: "ANNOUNCEMENT" });
  });

  it("writes rows idempotently, so a retry adds nothing", async () => {
    const create = vi.spyOn(prisma.notification, "createMany").mockResolvedValue({ count: 0 } as never);
    await createInboxNotifications([{ employeeId: "emp_1", kind: "ANNOUNCEMENT", title: "t", body: "b", announcementId: "ann_1" }]);
    expect(create.mock.calls[0]![0]).toMatchObject({ skipDuplicates: true });
  });

  it("a courtesy notice that fails to write does not throw, so it cannot undo a leave decision", async () => {
    vi.spyOn(prisma.notification, "createMany").mockRejectedValueOnce(new Error("db down"));
    await expect(
      recordInboxNotification({ employeeId: "emp_1", kind: "LEAVE_DECISION", title: "t", body: "b" }),
    ).resolves.toBeUndefined();
  });
});

describe("mobile notification endpoints", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(prisma.employee, "findUnique").mockResolvedValue({ id: "emp_1", status: "ACTIVE" } as never);
  });

  it("every endpoint refuses a request with no token", async () => {
    const url = "http://localhost:3000/api/v1/notifications";
    expect((await listRoute(new NextRequest(url))).status).toBe(401);
    expect((await unreadRoute(new NextRequest(`${url}/unread-count`))).status).toBe(401);
    expect(
      (await readRoute(new NextRequest(`${url}/n1/read`, { method: "POST" }), { params: Promise.resolve({ id: "n1" }) })).status,
    ).toBe(401);
    expect((await readAllRoute(new NextRequest(`${url}/read-all`, { method: "POST" }))).status).toBe(401);
  });

  it("refuses a token for an employee who is no longer active", async () => {
    vi.spyOn(prisma.employee, "findUnique").mockResolvedValue({ id: "emp_1", status: "TERMINATED" } as never);
    const res = await listRoute(new NextRequest("http://localhost:3000/api/v1/notifications", authed));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("EMPLOYEE_NOT_ACTIVE");
  });

  it("returns the caller's inbox with a cursor, taking the employee from the token", async () => {
    const find = vi.spyOn(prisma.notification, "findMany").mockResolvedValueOnce([row("n2"), row("n1")] as never);
    vi.spyOn(prisma.announcementRecipient, "findMany").mockResolvedValueOnce([
      { announcementId: "ann_1", acknowledgedAt: null, announcement: { requiresAck: true, isUrgent: true } },
    ] as never);

    const res = await listRoute(
      new NextRequest("http://localhost:3000/api/v1/notifications?kind=announcement&limit=1", authed),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: "n2", read: false, urgent: true, ackRequired: true, acknowledged: false });
    expect(body.nextCursor).toBe("n2");
    expect(find.mock.calls[0]![0]!.where).toEqual({ employeeId: "emp_1", kind: "ANNOUNCEMENT" });
  });

  it("rejects an unknown kind", async () => {
    const res = await listRoute(new NextRequest("http://localhost:3000/api/v1/notifications?kind=everything", authed));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_KIND");
  });

  it("returns the badge counts", async () => {
    vi.spyOn(prisma.notification, "count").mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    const res = await unreadRoute(new NextRequest("http://localhost:3000/api/v1/notifications/unread-count", authed));
    expect(await res.json()).toEqual({ ok: true, total: 5, announcements: 2 });
  });

  it("marks one read, and answers 404 for an id that is not theirs", async () => {
    vi.spyOn(prisma.notification, "findFirst").mockResolvedValueOnce({ id: "n1" } as never);
    vi.spyOn(prisma.notification, "updateMany").mockResolvedValue({ count: 1 } as never);
    const ok = await readRoute(
      new NextRequest("http://localhost:3000/api/v1/notifications/n1/read", { method: "POST", ...authed }),
      { params: Promise.resolve({ id: "n1" }) },
    );
    expect(ok.status).toBe(200);

    vi.spyOn(prisma.notification, "findFirst").mockResolvedValueOnce(null as never);
    const missing = await readRoute(
      new NextRequest("http://localhost:3000/api/v1/notifications/x/read", { method: "POST", ...authed }),
      { params: Promise.resolve({ id: "x" }) },
    );
    expect(missing.status).toBe(404);
  });

  it("marks everything read, or only announcements, depending on the body", async () => {
    const update = vi.spyOn(prisma.notification, "updateMany").mockResolvedValue({ count: 2 } as never);

    const all = await readAllRoute(new NextRequest("http://localhost:3000/api/v1/notifications/read-all", { method: "POST", ...authed }));
    expect(await all.json()).toEqual({ ok: true, updated: 2 });
    expect(update.mock.calls[0]![0]!.where).toEqual({ employeeId: "emp_1", readAt: null });

    await readAllRoute(
      new NextRequest("http://localhost:3000/api/v1/notifications/read-all", {
        method: "POST",
        headers: { ...authed.headers, "content-type": "application/json" },
        body: JSON.stringify({ kind: "announcement" }),
      }),
    );
    expect(update.mock.calls[1]![0]!.where).toEqual({ employeeId: "emp_1", readAt: null, kind: "ANNOUNCEMENT" });
  });
});
