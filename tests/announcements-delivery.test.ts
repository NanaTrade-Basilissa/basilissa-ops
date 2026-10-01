import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/platform/prisma";
import * as smsModule from "@/lib/platform/sms";
import * as emailModule from "@/lib/platform/email";
import * as pushModule from "@/lib/platform/push";
import { ackReminderDue, isUsablePhone, smsText, MAX_SMS_RECIPIENTS } from "@/lib/modules/announcements/constants";
import {
  fanoutAnnouncementEmail,
  fanoutAnnouncementSms,
  handleAnnouncementFanout,
  remindUnacknowledged,
} from "@/lib/modules/announcements/jobs";
import { getActiveUrgentBanner, retryFailedDeliveries, sendAnnouncement } from "@/lib/modules/announcements/server";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const S = { audit: { userId: "u1", email: "a@basilissa.invalid", role: "ADMINISTRATOR" }, name: "Admin" };

describe("pure delivery rules", () => {
  it("recognises a number worth texting", () => {
    for (const ok of ["0241234567", "024 123 4567", "+233241234567", "233241234567", "+447911123456"]) expect(isUsablePhone(ok)).toBe(true);
    for (const bad of [null, undefined, "", "12345", "abc", "024123"]) expect(isUsablePhone(bad)).toBe(false);
  });

  it("builds a text from the title and body, flattens whitespace and never exceeds the limit", () => {
    expect(smsText("Closed Friday", "See your\n\nmanager.")).toBe("Closed Friday. See your manager.");
    expect(smsText("T", "word ".repeat(200)).length).toBeLessThanOrEqual(320);
  });

  describe("when a confirmation reminder is due", () => {
    const ann = (over: object = {}) => ({ requiresAck: true, isUrgent: false, createdAt: hoursAgo(5), ...over });
    const rec = (over: object = {}) => ({ acknowledgedAt: null, ackReminderCount: 0, ackRemindedAt: null, ...over });

    it("waits 4 hours for an ordinary announcement and 1 hour for an urgent one", () => {
      expect(ackReminderDue(rec(), ann({ createdAt: hoursAgo(3) }), NOW)).toBe(false);
      expect(ackReminderDue(rec(), ann({ createdAt: hoursAgo(4) }), NOW)).toBe(true);
      expect(ackReminderDue(rec(), ann({ isUrgent: true, createdAt: hoursAgo(1) }), NOW)).toBe(true);
    });
    it("then repeats daily, at most three times", () => {
      expect(ackReminderDue(rec({ ackReminderCount: 1, ackRemindedAt: hoursAgo(23) }), ann(), NOW)).toBe(false);
      expect(ackReminderDue(rec({ ackReminderCount: 1, ackRemindedAt: hoursAgo(24) }), ann(), NOW)).toBe(true);
      expect(ackReminderDue(rec({ ackReminderCount: 3, ackRemindedAt: hoursAgo(48) }), ann(), NOW)).toBe(false);
    });
    it("never for someone who confirmed, an announcement that did not ask, or one older than a week", () => {
      expect(ackReminderDue(rec({ acknowledgedAt: NOW }), ann(), NOW)).toBe(false);
      expect(ackReminderDue(rec(), ann({ requiresAck: false }), NOW)).toBe(false);
      expect(ackReminderDue(rec(), ann({ createdAt: hoursAgo(24 * 8) }), NOW)).toBe(false);
    });
  });
});

describe("SMS fan-out", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(prisma.announcement, "findUnique").mockResolvedValue({ title: "Hi", body: "There", sendSms: true } as never);
  });
  const pending = (rows: object[]) =>
    vi.spyOn(prisma.announcementRecipient, "findMany").mockResolvedValueOnce(rows as never).mockResolvedValueOnce([] as never);

  it("texts people with a usable number, skips the rest as unreachable, and records each outcome", async () => {
    pending([
      { id: "r1", employee: { phone: "0241234567", firstName: "Ama" } },
      { id: "r2", employee: { phone: null, firstName: "Kofi" } },
      { id: "r3", employee: { phone: "0241234568", firstName: "Esi" } },
    ]);
    const send = vi
      .spyOn(smsModule, "sendSms")
      .mockResolvedValueOnce({ ok: true, messageId: "m1" })
      .mockResolvedValueOnce({ ok: false, error: "gateway down" });
    const update = vi.spyOn(prisma.announcementRecipient, "update").mockResolvedValue({} as never);

    expect(await fanoutAnnouncementSms({ announcementId: "a1" })).toEqual({ sent: 1, failed: 1, unreachable: 1 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]![0]).toMatchObject({ recipient: "0241234567", message: "Hi. There", name: "Ama", subject: "Hi" });
    const by = (id: string) => update.mock.calls.find((c) => c[0].where.id === id)![0].data;
    expect(by("r1")).toMatchObject({ smsStatus: "SENT" });
    expect(by("r2")).toEqual({ smsStatus: "UNREACHABLE" });
    expect(by("r3")).toMatchObject({ smsStatus: "FAILED", smsError: "gateway down" });
  });

  it("only picks up pending recipients, and does nothing when SMS was not chosen", async () => {
    const find = pending([]);
    await fanoutAnnouncementSms({ announcementId: "a1" });
    expect(find.mock.calls[0]![0]!.where).toEqual({ announcementId: "a1", smsStatus: "PENDING" });

    vi.spyOn(prisma.announcement, "findUnique").mockResolvedValue({ title: "x", body: "y", sendSms: false } as never);
    const send = vi.spyOn(smsModule, "sendSms");
    expect(await fanoutAnnouncementSms({ announcementId: "a1" })).toEqual({ sent: 0, failed: 0, unreachable: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("a gateway that throws is recorded as a failure, not a crash", async () => {
    pending([{ id: "r1", employee: { phone: "0241234567" } }]);
    vi.spyOn(smsModule, "sendSms").mockRejectedValueOnce(new Error("timeout"));
    const update = vi.spyOn(prisma.announcementRecipient, "update").mockResolvedValue({} as never);
    expect(await fanoutAnnouncementSms({ announcementId: "a1" })).toMatchObject({ failed: 1 });
    expect(update.mock.calls[0]![0].data).toMatchObject({ smsStatus: "FAILED", smsError: "timeout" });
  });
});

describe("email fan-out", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(prisma.announcement, "findUnique").mockResolvedValue({ title: "Hi", body: "There", sendEmail: true, createdByName: "Efua" } as never);
  });

  it("emails each person once with a stable idempotency key, and records sent, failed, skipped and none-on-file", async () => {
    vi.spyOn(prisma.announcementRecipient, "findMany")
      .mockResolvedValueOnce([
        { id: "r1", employeeId: "e1", employee: { email: "a@x.com", firstName: "Ama" } },
        { id: "r2", employeeId: "e2", employee: { email: null, firstName: "Kofi" } },
        { id: "r3", employeeId: "e3", employee: { email: "c@x.com", firstName: "Esi" } },
        { id: "r4", employeeId: "e4", employee: { email: "d@x.com", firstName: "Yaw" } },
      ] as never)
      .mockResolvedValueOnce([] as never);
    const send = vi
      .spyOn(emailModule, "sendEmail")
      .mockResolvedValueOnce({ status: "sent", id: "1" })
      .mockResolvedValueOnce({ status: "failed", retryable: true, error: "smtp 421" })
      .mockResolvedValueOnce({ status: "skipped", reason: "not_configured" });
    const update = vi.spyOn(prisma.announcementRecipient, "update").mockResolvedValue({} as never);

    expect(await fanoutAnnouncementEmail({ announcementId: "a1" })).toEqual({ sent: 1, failed: 2, unreachable: 1 });
    expect(send.mock.calls[0]![0]).toMatchObject({ to: ["a@x.com"], subject: "Hi", idempotencyKey: "announcement:a1:e1" });
    const by = (id: string) => update.mock.calls.find((c) => c[0].where.id === id)![0].data;
    expect(by("r1")).toMatchObject({ emailStatus: "SENT" });
    expect(by("r2")).toEqual({ emailStatus: "UNREACHABLE" });
    expect(by("r3")).toMatchObject({ emailStatus: "FAILED", emailError: "smtp 421" });
    expect(by("r4")).toMatchObject({ emailStatus: "FAILED", emailError: "Email is not configured" });
  });

  it("the job runs every channel, and one failing does not stop the others", async () => {
    vi.spyOn(prisma.announcement, "findUnique").mockResolvedValue({ title: "t", body: "b", sendPush: true, sendSms: true, sendEmail: true, createdByName: "x" } as never);
    const find = vi.spyOn(prisma.announcementRecipient, "findMany").mockImplementation((async (args: { where: Record<string, unknown> }) => {
      if (args.where.pushStatus) throw new Error("push provider down");
      return [];
    }) as never);
    await expect(handleAnnouncementFanout({ announcementId: "a1" })).rejects.toThrow("push provider down");
    const asked = find.mock.calls.map((c) => Object.keys((c[0] as { where: object }).where));
    expect(asked.some((keys) => keys.includes("smsStatus"))).toBe(true);
    expect(asked.some((keys) => keys.includes("emailStatus"))).toBe(true);
  });
});

describe("sending with SMS", () => {
  const INPUT = {
    title: "Hi", body: "There", audienceKind: "ALL" as const, branchIds: [] as string[], employeeIds: [] as string[],
    sendPush: false, sendEmail: true, sendSms: true, isUrgent: false, bannerHours: 24, requiresAck: false,
  };
  // One spy, queued in the order the service calls it: the directory, then the phone numbers.
  const find = () => vi.mocked(prisma.employee.findMany);
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(prisma.employee, "findMany");
    find().mockResolvedValueOnce([{ id: "ama", status: "ACTIVE", branchAssignments: [] }] as never);
  });

  it("refuses to text more people than the limit, and writes nothing", async () => {
    find().mockResolvedValueOnce(Array.from({ length: MAX_SMS_RECIPIENTS + 1 }, () => ({ phone: "0241234567" })) as never);
    const tx = vi.spyOn(prisma, "$transaction");
    expect(await sendAnnouncement(INPUT, S, { kind: "all" }, NOW)).toEqual({ ok: false, error: "SMS_LIMIT" });
    expect(tx).not.toHaveBeenCalled();
  });

  it("marks SMS and email pending per recipient and queues the fan-out", async () => {
    find().mockResolvedValueOnce([{ phone: "0241234567" }] as never);
    const t = {
      announcement: { create: vi.fn().mockResolvedValue({ id: "a1" }), updateMany: vi.fn() },
      announcementRecipient: { createMany: vi.fn() },
      notification: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      job: { create: vi.fn().mockResolvedValue({ id: "job_1" }) },
      auditLog: { create: vi.fn() },
    };
    vi.spyOn(prisma, "$transaction").mockImplementation((async (fn: (c: unknown) => unknown) => fn(t)) as never);
    await sendAnnouncement(INPUT, S, { kind: "all" }, NOW);
    expect(t.announcement.create.mock.calls[0]![0].data).toMatchObject({ sendSms: true, sendEmail: true });
    expect(t.announcementRecipient.createMany.mock.calls[0]![0].data[0]).toMatchObject({ pushStatus: "NOT_REQUESTED", smsStatus: "PENDING", emailStatus: "PENDING" });
    expect(t.job.create).toHaveBeenCalledTimes(1);
  });
});

describe("automatic confirmation reminders", () => {
  beforeEach(() => vi.restoreAllMocks());
  const row = (id: string, over: object = {}, ann: object = {}) => ({
    id, employeeId: `e_${id}`, announcementId: "a1", acknowledgedAt: null, ackReminderCount: 0, ackRemindedAt: null,
    announcement: { title: "Fire drill", requiresAck: true, isUrgent: false, createdAt: hoursAgo(5), ...ann }, ...over,
  });

  it("nudges only those who are due, and records it before the push so a failure is not repeated every sweep", async () => {
    vi.spyOn(prisma.announcementRecipient, "findMany").mockResolvedValueOnce([
      row("due"),
      row("too-soon", {}, { createdAt: hoursAgo(2) }),
      row("max", { ackReminderCount: 3, ackRemindedAt: hoursAgo(99) }),
    ] as never);
    const update = vi.spyOn(prisma.announcementRecipient, "update").mockResolvedValue({} as never);
    const push = vi.spyOn(pushModule, "sendEmployeePushNotification").mockResolvedValue({ dispatched: 1, receipts: [] });

    expect(await remindUnacknowledged(NOW)).toEqual({ examined: 3, reminded: 1 });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]![0]).toBe("e_due");
    expect(push.mock.calls[0]![1]).toMatchObject({ data: { announcementId: "a1", reminder: true } });
    expect(update.mock.calls[0]![0]).toMatchObject({ where: { id: "due" }, data: { ackReminderCount: { increment: 1 }, ackRemindedAt: NOW } });
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0]!);
  });

  it("a push that throws does not stop the sweep or un-record the reminder", async () => {
    vi.spyOn(prisma.announcementRecipient, "findMany").mockResolvedValueOnce([row("a"), row("b")] as never);
    const update = vi.spyOn(prisma.announcementRecipient, "update").mockResolvedValue({} as never);
    vi.spyOn(pushModule, "sendEmployeePushNotification").mockRejectedValueOnce(new Error("fcm")).mockResolvedValueOnce({ dispatched: 1, receipts: [] });
    expect(await remindUnacknowledged(NOW)).toEqual({ examined: 2, reminded: 1 });
    expect(update).toHaveBeenCalledTimes(2);
  });
});

describe("the banner lingers for people who have not confirmed", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("falls back to an expired banner they still owe a confirmation on, but not one that was ended by hand", async () => {
    const find = vi.spyOn(prisma.announcement, "findFirst").mockResolvedValueOnce(null as never).mockResolvedValueOnce({
      id: "old", title: "Fire drill", body: "x", requiresAck: true, bannerExpiresAt: hoursAgo(2), createdAt: hoursAgo(6),
      recipients: [{ acknowledgedAt: null }],
    } as never);
    const banner = await getActiveUrgentBanner("ama", NOW);
    expect(banner).toMatchObject({ id: "old", acknowledged: false });
    const lingering = find.mock.calls[1]![0]!.where as Record<string, unknown>;
    expect(lingering).toMatchObject({
      isUrgent: true,
      requiresAck: true,
      recipients: { some: { employeeId: "ama", acknowledgedAt: null } },
      OR: [{ bannerClearedAt: null, bannerExpiresAt: { lte: NOW } }, { bannerClearReason: "EXPIRED" }],
    });
    expect(JSON.stringify(lingering)).not.toContain("MANUAL");
    expect(JSON.stringify(lingering)).not.toContain("SUPERSEDED");
  });

  it("prefers the live banner and does not look further", async () => {
    const find = vi.spyOn(prisma.announcement, "findFirst").mockResolvedValueOnce({
      id: "live", title: "t", body: "b", requiresAck: false, bannerExpiresAt: null, createdAt: NOW, recipients: [],
    } as never);
    expect((await getActiveUrgentBanner("ama", NOW))!.id).toBe("live");
    expect(find).toHaveBeenCalledTimes(1);
  });
});

describe("retrying failed deliveries", () => {
  beforeEach(() => vi.restoreAllMocks());
  const stub = (counts: [number, number, number]) => {
    const t = {
      announcementRecipient: {
        updateMany: vi.fn().mockResolvedValueOnce({ count: counts[0] }).mockResolvedValueOnce({ count: counts[1] }).mockResolvedValueOnce({ count: counts[2] }),
      },
      job: { create: vi.fn().mockResolvedValue({ id: "job_1" }) },
      auditLog: { create: vi.fn() },
    };
    vi.spyOn(prisma, "$transaction").mockImplementation((async (fn: (c: unknown) => unknown) => fn(t)) as never);
    return t;
  };

  it("puts only FAILED deliveries back to pending, queues the fan-out and audits it", async () => {
    const t = stub([2, 1, 0]);
    expect(await retryFailedDeliveries("a1", S)).toBe(3);
    for (const [call, field] of [[0, "pushStatus"], [1, "smsStatus"], [2, "emailStatus"]] as const) {
      expect(t.announcementRecipient.updateMany.mock.calls[call]![0].where).toEqual({ announcementId: "a1", [field]: "FAILED" });
    }
    expect(t.job.create).toHaveBeenCalledTimes(1);
    expect(t.auditLog.create.mock.calls[0]![0].data.action).toBe("announcement.delivery_retried");
  });

  it("does nothing, and queues nothing, when nothing failed", async () => {
    const t = stub([0, 0, 0]);
    expect(await retryFailedDeliveries("a1", S)).toBe(0);
    expect(t.job.create).not.toHaveBeenCalled();
  });
});

describe("pruning dead push tokens", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("removes only the dead token and keeps the binding and the device name", async () => {
    vi.spyOn(prisma.employeeDeviceIdentity, "findMany").mockResolvedValueOnce([
      { id: "i1", label: JSON.stringify({ deviceName: "TECNO KM5", pushToken: "dead_token_value", platform: "android" }) },
      // a different token that merely contains the dead one as a substring must be left alone
      { id: "i2", label: JSON.stringify({ deviceName: "Other", pushToken: "dead_token_value_but_longer" }) },
    ] as never);
    const update = vi.spyOn(prisma.employeeDeviceIdentity, "update").mockResolvedValue({} as never);

    expect(await pushModule.pruneDeadPushTokens(["dead_token_value"])).toBe(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]![0]).toEqual({ where: { id: "i1" }, data: { label: "TECNO KM5" } });
  });
});
