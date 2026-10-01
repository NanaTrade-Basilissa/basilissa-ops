import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { createDeviceToken } from "@/lib/modules/attendance/server";
import {
  acknowledgeAnnouncement,
  clearUrgentBanner,
  getActiveUrgentBanner,
  sendAnnouncement,
} from "@/lib/modules/announcements/server";
import { expireUrgentBanners } from "@/lib/modules/announcements/jobs";
import { GET as urgentRoute } from "@/app/api/v1/announcements/urgent/route";
import { POST as ackRoute } from "@/app/api/v1/announcements/[id]/ack/route";

vi.mock("@/lib/platform/rate-limit", () => ({
  rateLimit: async () => ({ success: true, resetAt: 0 }),
  getClientIp: () => "test",
}));

const SENDER = { audit: { userId: "u1", email: "hr@basilissa.invalid", role: "HR" }, name: "Efua HR" };
const NOW = new Date("2026-10-01T10:00:00.000Z");
const INPUT = {
  title: "Fire drill",
  body: "Assemble at the front.",
  audienceKind: "ALL" as const,
  branchIds: [] as string[],
  employeeIds: [] as string[],
  sendPush: false,
  sendEmail: false,
  sendSms: false,
  isUrgent: true,
  bannerHours: 4,
  requiresAck: true,
};

function tx() {
  return {
    announcement: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: "ann_1" }),
    },
    announcementRecipient: { createMany: vi.fn().mockResolvedValue({ count: 1 }), updateMany: vi.fn() },
    notification: { createMany: vi.fn().mockResolvedValue({ count: 1 }), updateMany: vi.fn() },
    job: { create: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
}

describe("sending an urgent announcement", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(prisma.employee, "findMany").mockResolvedValue([
      { id: "ama", status: "ACTIVE", branchAssignments: [{ branchId: "accra" }] },
    ] as never);
  });

  it("is refused for a branch-scoped sender, because the banner is company-wide", async () => {
    const spy = vi.spyOn(prisma, "$transaction");
    const result = await sendAnnouncement(INPUT, SENDER, { kind: "branches", branchIds: ["accra"] }, NOW);
    expect(result).toEqual({ ok: false, error: "URGENT_NEEDS_GLOBAL" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("frees the banner slot (expired first, then the live one) before creating the new one, and sets the expiry", async () => {
    const t = tx();
    vi.spyOn(prisma, "$transaction").mockImplementation((async (fn: (c: unknown) => unknown) => fn(t)) as never);

    const result = await sendAnnouncement(INPUT, SENDER, { kind: "all" }, NOW);

    expect(result).toMatchObject({ ok: true });
    const [expired, superseded] = t.announcement.updateMany.mock.calls;
    expect(expired![0].data).toMatchObject({ bannerClearReason: "EXPIRED" });
    expect(superseded![0].data).toMatchObject({ bannerClearReason: "SUPERSEDED", bannerClearedBy: "u1" });
    expect(t.announcement.updateMany.mock.invocationCallOrder[1]).toBeLessThan(t.announcement.create.mock.invocationCallOrder[0]!);
    expect(t.announcement.create.mock.calls[0]![0].data).toMatchObject({
      isUrgent: true,
      requiresAck: true,
      bannerExpiresAt: new Date("2026-10-01T14:00:00.000Z"),
    });
  });

  it("reports a clash when the database refuses a second active urgent announcement", async () => {
    vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "x" }),
    );
    expect(await sendAnnouncement(INPUT, SENDER, { kind: "all" }, NOW)).toEqual({ ok: false, error: "URGENT_CONFLICT" });
  });

  it("does not touch the banner for an ordinary announcement", async () => {
    const t = tx();
    vi.spyOn(prisma, "$transaction").mockImplementation((async (fn: (c: unknown) => unknown) => fn(t)) as never);
    await sendAnnouncement({ ...INPUT, isUrgent: false, requiresAck: false }, SENDER, { kind: "all" }, NOW);
    expect(t.announcement.updateMany).not.toHaveBeenCalled();
    expect(t.announcement.create.mock.calls[0]![0].data.bannerExpiresAt).toBeNull();
  });
});

describe("acknowledgement", () => {
  beforeEach(() => vi.restoreAllMocks());
  const recipient = (over: object = {}) =>
    vi.spyOn(prisma.announcementRecipient, "findUnique").mockResolvedValue({
      acknowledgedAt: null,
      announcement: { requiresAck: true },
      ...over,
    } as never);

  it("is set once with its audit entry, and marks the inbox row read", async () => {
    recipient();
    const t = tx();
    t.announcementRecipient.updateMany.mockResolvedValue({ count: 1 });
    vi.spyOn(prisma, "$transaction").mockImplementation((async (fn: (c: unknown) => unknown) => fn(t)) as never);

    expect(await acknowledgeAnnouncement("ama", "ann_1", NOW)).toBe("OK");
    expect(t.announcementRecipient.updateMany.mock.calls[0]![0]).toMatchObject({
      where: { announcementId: "ann_1", employeeId: "ama", acknowledgedAt: null },
      data: { acknowledgedAt: NOW },
    });
    expect(t.notification.updateMany).toHaveBeenCalled();
    expect(t.auditLog.create.mock.calls[0]![0].data).toMatchObject({ action: "announcement.acknowledged", entityId: "ann_1" });
  });

  it("never changes an acknowledgement already given", async () => {
    recipient({ acknowledgedAt: new Date("2026-10-01T09:00:00Z") });
    const spy = vi.spyOn(prisma, "$transaction");
    expect(await acknowledgeAnnouncement("ama", "ann_1", NOW)).toBe("ALREADY");
    expect(spy).not.toHaveBeenCalled();
  });

  it("is not available to someone who did not receive it, or for an announcement that did not ask", async () => {
    vi.spyOn(prisma.announcementRecipient, "findUnique").mockResolvedValueOnce(null as never);
    expect(await acknowledgeAnnouncement("stranger", "ann_1", NOW)).toBe("NOT_FOUND");
    recipient({ announcement: { requiresAck: false } });
    expect(await acknowledgeAnnouncement("ama", "ann_1", NOW)).toBe("NOT_REQUIRED");
  });
});

describe("banner state", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("shows only an active, uncleared, unexpired banner addressed to the employee", async () => {
    const find = vi.spyOn(prisma.announcement, "findFirst").mockResolvedValueOnce(null as never);
    expect(await getActiveUrgentBanner("ama", NOW)).toBeNull();
    expect(find.mock.calls[0]![0]!.where).toMatchObject({
      isUrgent: true,
      bannerClearedAt: null,
      OR: [{ bannerExpiresAt: null }, { bannerExpiresAt: { gt: NOW } }],
      recipients: { some: { employeeId: "ama" } },
    });
  });

  it("reports whether this person has already confirmed it", async () => {
    vi.spyOn(prisma.announcement, "findFirst").mockResolvedValueOnce({
      id: "ann_1", title: "Fire drill", body: "x", requiresAck: true, bannerExpiresAt: NOW, createdAt: NOW,
      recipients: [{ acknowledgedAt: NOW }],
    } as never);
    expect(await getActiveUrgentBanner("ama", NOW)).toMatchObject({ id: "ann_1", requiresAck: true, acknowledged: true });
  });

  it("ending it by hand clears only a live banner, and audits it", async () => {
    const t = tx();
    t.announcement.updateMany.mockResolvedValue({ count: 1 });
    vi.spyOn(prisma, "$transaction").mockImplementation((async (fn: (c: unknown) => unknown) => fn(t)) as never);
    expect(await clearUrgentBanner("ann_1", SENDER, NOW)).toBe(true);
    expect(t.announcement.updateMany.mock.calls[0]![0].where).toMatchObject({ id: "ann_1", isUrgent: true, bannerClearedAt: null });
    expect(t.auditLog.create.mock.calls[0]![0].data.action).toBe("announcement.banner_cleared");
  });

  it("the sweep takes down expired banners only", async () => {
    const update = vi.spyOn(prisma.announcement, "updateMany").mockResolvedValue({ count: 2 } as never);
    expect(await expireUrgentBanners(NOW)).toBe(2);
    expect(update.mock.calls[0]![0]).toMatchObject({
      where: { isUrgent: true, bannerClearedAt: null, bannerExpiresAt: { lte: NOW } },
      data: { bannerClearReason: "EXPIRED" },
    });
  });
});

describe("mobile endpoints", () => {
  const token = createDeviceToken({ employeeId: "emp_1", deviceId: "d", phone: "+233241234567" });
  const authed = { headers: { Authorization: `Bearer ${token}` } };
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(prisma.employee, "findUnique").mockResolvedValue({ id: "emp_1", status: "ACTIVE" } as never);
  });

  it("require a token", async () => {
    expect((await urgentRoute(new NextRequest("http://x/api/v1/announcements/urgent"))).status).toBe(401);
    const ack = await ackRoute(new NextRequest("http://x/api/v1/announcements/a/ack", { method: "POST" }), { params: Promise.resolve({ id: "a" }) });
    expect(ack.status).toBe(401);
  });

  it("serve the banner, or null when there is none", async () => {
    vi.spyOn(prisma.announcement, "findFirst").mockResolvedValueOnce(null as never);
    const res = await urgentRoute(new NextRequest("http://x/api/v1/announcements/urgent", authed));
    expect(await res.json()).toEqual({ ok: true, banner: null });
  });

  it("acknowledge: 200 for a recipient, 404 for a stranger, 409 when not asked", async () => {
    const call = () =>
      ackRoute(new NextRequest("http://x/api/v1/announcements/ann_1/ack", { method: "POST", ...authed }), { params: Promise.resolve({ id: "ann_1" }) });

    vi.spyOn(prisma.announcementRecipient, "findUnique").mockResolvedValueOnce({ acknowledgedAt: new Date(), announcement: { requiresAck: true } } as never);
    expect(await (await call()).json()).toEqual({ ok: true, alreadyAcknowledged: true });

    vi.spyOn(prisma.announcementRecipient, "findUnique").mockResolvedValueOnce(null as never);
    expect((await call()).status).toBe(404);

    vi.spyOn(prisma.announcementRecipient, "findUnique").mockResolvedValueOnce({ acknowledgedAt: null, announcement: { requiresAck: false } } as never);
    expect((await call()).status).toBe(409);
  });
});
