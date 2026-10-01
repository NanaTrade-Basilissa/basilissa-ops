import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/platform/prisma";
import * as pushModule from "@/lib/platform/push";
import { PermanentJobError } from "@/lib/platform/jobs";
import {
  ANNOUNCEMENT_FANOUT,
  fanoutAnnouncementPush,
  pushBodyPreview,
} from "@/lib/modules/announcements/jobs";
import { HANDLERS } from "@/worker/registry";

const ANNOUNCEMENT = { id: "ann_1", title: "Branch closed Friday", body: "Please see your manager.", sendPush: true };

function identity(employeeId: string, pushToken?: string) {
  return { employeeId, label: pushToken ? JSON.stringify({ pushToken }) : null };
}

describe("announcement push fan-out", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(prisma.announcement, "findUnique").mockResolvedValue(ANNOUNCEMENT as never);
  });

  it("is registered with the worker", () => {
    expect(HANDLERS[ANNOUNCEMENT_FANOUT]).toBeTypeOf("function");
  });

  it("sends once per token, records each person's outcome, and carries only an id and a preview", async () => {
    const findPending = vi
      .spyOn(prisma.announcementRecipient, "findMany")
      .mockResolvedValueOnce([
        { id: "r1", employeeId: "ama" },
        { id: "r2", employeeId: "kofi" },
        { id: "r3", employeeId: "esi" },
        { id: "r4", employeeId: "yaw" },
      ] as never)
      .mockResolvedValueOnce([] as never);
    vi.spyOn(prisma.employeeDeviceIdentity, "findMany").mockResolvedValueOnce([
      identity("ama", "ExponentPushToken[ama]"),
      identity("kofi", "ExponentPushToken[kofi]"),
      identity("esi"), // a bound phone that never registered a push token
      // yaw has no app at all
    ] as never);
    const send = vi.spyOn(pushModule, "sendPushNotification").mockResolvedValueOnce([
      { ok: true, token: "ExponentPushToken[ama]", id: "t1" },
      { ok: false, token: "ExponentPushToken[kofi]", error: "DeviceNotRegistered" },
    ]);
    const updateMany = vi.spyOn(prisma.announcementRecipient, "updateMany").mockResolvedValue({ count: 1 } as never);
    const update = vi.spyOn(prisma.announcementRecipient, "update").mockResolvedValue({} as never);

    const summary = await fanoutAnnouncementPush({ announcementId: "ann_1" });

    expect(summary).toEqual({ sent: 1, failed: 1, unreachable: 2 });
    expect(findPending).toHaveBeenCalledTimes(2);
    expect(findPending.mock.calls[0]![0]!.where).toEqual({ announcementId: "ann_1", pushStatus: "PENDING" });

    expect(send).toHaveBeenCalledTimes(1);
    const [tokens, payload] = send.mock.calls[0]!;
    expect(tokens).toEqual(["ExponentPushToken[ama]", "ExponentPushToken[kofi]"]);
    expect(payload).toMatchObject({
      title: "Branch closed Friday",
      body: "Please see your manager.",
      data: { type: "ANNOUNCEMENT", announcementId: "ann_1" },
    });

    const sentCall = updateMany.mock.calls.find((call) => call[0]!.data!.pushStatus === "SENT");
    expect(sentCall![0]!.where).toEqual({ id: { in: ["r1"] } });
    const unreachableCall = updateMany.mock.calls.find((call) => call[0]!.data!.pushStatus === "UNREACHABLE");
    expect(unreachableCall![0]!.where).toEqual({ id: { in: ["r3", "r4"] } });
    expect(update.mock.calls[0]![0]).toMatchObject({
      where: { id: "r2" },
      data: { pushStatus: "FAILED", pushError: "DeviceNotRegistered" },
    });
  });

  it("counts a person as reached when any one of their devices accepts it", async () => {
    vi.spyOn(prisma.announcementRecipient, "findMany")
      .mockResolvedValueOnce([{ id: "r1", employeeId: "ama" }] as never)
      .mockResolvedValueOnce([] as never);
    vi.spyOn(prisma.employeeDeviceIdentity, "findMany").mockResolvedValueOnce([
      identity("ama", "ExponentPushToken[old]"),
      identity("ama", "ExponentPushToken[new]"),
    ] as never);
    vi.spyOn(pushModule, "sendPushNotification").mockResolvedValueOnce([
      { ok: false, token: "ExponentPushToken[old]", error: "DeviceNotRegistered" },
      { ok: true, token: "ExponentPushToken[new]", id: "t2" },
    ]);
    vi.spyOn(prisma.announcementRecipient, "updateMany").mockResolvedValue({ count: 1 } as never);
    const update = vi.spyOn(prisma.announcementRecipient, "update").mockResolvedValue({} as never);

    const summary = await fanoutAnnouncementPush({ announcementId: "ann_1" });

    expect(summary).toEqual({ sent: 1, failed: 0, unreachable: 0 });
    expect(update).not.toHaveBeenCalled();
  });

  it("only ever picks up recipients still pending, which is what makes a retry safe", async () => {
    const findPending = vi.spyOn(prisma.announcementRecipient, "findMany").mockResolvedValueOnce([] as never);
    const send = vi.spyOn(pushModule, "sendPushNotification");

    const summary = await fanoutAnnouncementPush({ announcementId: "ann_1" });

    expect(summary).toEqual({ sent: 0, failed: 0, unreachable: 0 });
    expect(findPending.mock.calls[0]![0]!.where).toMatchObject({ pushStatus: "PENDING" });
    expect(send).not.toHaveBeenCalled();
  });

  it("does nothing for an announcement that did not ask for push", async () => {
    vi.spyOn(prisma.announcement, "findUnique").mockResolvedValue({ ...ANNOUNCEMENT, sendPush: false } as never);
    const findPending = vi.spyOn(prisma.announcementRecipient, "findMany");

    expect(await fanoutAnnouncementPush({ announcementId: "ann_1" })).toEqual({ sent: 0, failed: 0, unreachable: 0 });
    expect(findPending).not.toHaveBeenCalled();
  });

  it("dies at once for an announcement that no longer exists: retrying cannot bring it back", async () => {
    vi.spyOn(prisma.announcement, "findUnique").mockResolvedValue(null as never);
    await expect(fanoutAnnouncementPush({ announcementId: "gone" })).rejects.toBeInstanceOf(PermanentJobError);
  });

  it("rejects a malformed payload", async () => {
    await expect(fanoutAnnouncementPush({})).rejects.toThrow();
  });
});

describe("pushBodyPreview", () => {
  it("collapses whitespace and leaves short text alone", () => {
    expect(pushBodyPreview("  Line one\n\nline   two ")).toBe("Line one line two");
  });

  it("shortens a long message so a lock screen never shows all of it", () => {
    const preview = pushBodyPreview("word ".repeat(100));
    expect(preview.length).toBeLessThanOrEqual(140);
    expect(preview.endsWith("…")).toBe(true);
  });
});
