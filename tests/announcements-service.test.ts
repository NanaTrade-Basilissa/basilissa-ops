import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/platform/prisma";
import * as identityModule from "@/lib/modules/identity/server";
import { previewAudience, sendAnnouncement } from "@/lib/modules/announcements/server";
import { sendAnnouncementAction, previewAnnouncementAudienceAction } from "@/lib/modules/announcements/actions";
import type { BranchScope } from "@/lib/modules/identity/authorization";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const SENDER = { audit: { userId: "user_1", email: "hr@basilissa.invalid", role: "HR" }, name: "Efua HR" };
const ALL: BranchScope = { kind: "all" };
const ACCRA: BranchScope = { kind: "branches", branchIds: ["accra"] };

function employee(id: string, branchIds: string[], status = "ACTIVE") {
  return { id, status, branchAssignments: branchIds.map((branchId) => ({ branchId })) };
}

/** A transaction client that records every write, so the one-transaction claim is checkable. */
function transactionStub() {
  return {
    announcement: { create: vi.fn().mockResolvedValue({ id: "ann_1" }) },
    announcementRecipient: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    notification: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    job: { create: vi.fn().mockResolvedValue({ id: "job_1" }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
}

const INPUT = {
  title: "Branch closed Friday",
  body: "Please see your manager.",
  audienceKind: "BRANCHES" as const,
  branchIds: ["accra"],
  employeeIds: [] as string[],
  sendPush: true,
};

describe("sendAnnouncement", () => {
  let tx: ReturnType<typeof transactionStub>;

  beforeEach(() => {
    vi.restoreAllMocks();
    tx = transactionStub();
    vi.spyOn(prisma, "$transaction").mockImplementation((async (fn: (client: unknown) => unknown) => fn(tx)) as never);
  });

  it("writes the announcement, recipients, inbox rows, push job and audit in one transaction", async () => {
    vi.spyOn(prisma.employee, "findMany").mockResolvedValueOnce([
      employee("ama", ["accra"]),
      employee("kofi", ["accra", "tema"]),
    ] as never);

    const result = await sendAnnouncement(INPUT, SENDER, ALL);

    expect(result).toEqual({ ok: true, announcementId: "ann_1", recipients: 2 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    expect(tx.announcement.create.mock.calls[0]![0].data).toMatchObject({
      title: "Branch closed Friday",
      audienceKind: "BRANCHES",
      sendPush: true,
      createdBy: "user_1",
      createdByName: "Efua HR",
    });
    const recipients = tx.announcementRecipient.createMany.mock.calls[0]![0].data;
    expect(recipients).toEqual([
      { announcementId: "ann_1", employeeId: "ama", pushStatus: "PENDING" },
      { announcementId: "ann_1", employeeId: "kofi", pushStatus: "PENDING" },
    ]);
    const inbox = tx.notification.createMany.mock.calls[0]![0].data;
    expect(inbox).toHaveLength(2);
    expect(inbox[0]).toMatchObject({ employeeId: "ama", kind: "ANNOUNCEMENT", announcementId: "ann_1" });
    expect(tx.job.create.mock.calls[0]![0].data).toMatchObject({
      type: "announcements.fanout",
      payload: { announcementId: "ann_1" },
    });
    expect(tx.auditLog.create.mock.calls[0]![0].data).toMatchObject({
      action: "announcement.sent",
      entityType: "Announcement",
      entityId: "ann_1",
      actorUserId: "user_1",
    });
  });

  it("without push it writes the inbox only: no push job, nothing pending", async () => {
    vi.spyOn(prisma.employee, "findMany").mockResolvedValueOnce([employee("ama", ["accra"])] as never);

    await sendAnnouncement({ ...INPUT, sendPush: false }, SENDER, ALL);

    expect(tx.job.create).not.toHaveBeenCalled();
    expect(tx.announcementRecipient.createMany.mock.calls[0]![0].data[0].pushStatus).toBe("NOT_REQUESTED");
    expect(tx.notification.createMany).toHaveBeenCalledTimes(1);
  });

  it("never reaches an inactive employee", async () => {
    vi.spyOn(prisma.employee, "findMany").mockResolvedValueOnce([
      employee("ama", ["accra"]),
      employee("yaw", ["accra"], "TERMINATED"),
    ] as never);

    const result = await sendAnnouncement(INPUT, SENDER, ALL);

    expect(result).toMatchObject({ ok: true, recipients: 1 });
    expect(tx.announcementRecipient.createMany.mock.calls[0]![0].data.map((r: { employeeId: string }) => r.employeeId)).toEqual([
      "ama",
    ]);
  });

  it("refuses a branch manager sending to a branch they do not manage, and writes nothing", async () => {
    vi.spyOn(prisma.employee, "findMany").mockResolvedValueOnce([employee("esi", ["tema"])] as never);

    const result = await sendAnnouncement({ ...INPUT, branchIds: ["tema"] }, SENDER, ACCRA);

    expect(result).toEqual({ ok: false, error: "BRANCH_OUT_OF_SCOPE" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a branch manager sending to Everyone", async () => {
    vi.spyOn(prisma.employee, "findMany").mockResolvedValueOnce([employee("ama", ["accra"])] as never);

    const result = await sendAnnouncement({ ...INPUT, audienceKind: "ALL" }, SENDER, ACCRA);

    expect(result).toEqual({ ok: false, error: "ALL_NEEDS_GLOBAL" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses an audience nobody active belongs to", async () => {
    vi.spyOn(prisma.employee, "findMany").mockResolvedValueOnce([] as never);

    const result = await sendAnnouncement(INPUT, SENDER, ALL);

    expect(result).toEqual({ ok: false, error: "NO_RECIPIENTS" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("previewAudience", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("counts recipients and how many have the app", async () => {
    vi.spyOn(prisma.employee, "findMany").mockResolvedValueOnce([
      employee("ama", ["accra"]),
      employee("kofi", ["accra"]),
      employee("esi", ["accra"]),
    ] as never);
    vi.spyOn(prisma.employeeDeviceIdentity, "findMany").mockResolvedValueOnce([
      { employeeId: "ama" },
      { employeeId: "kofi" },
    ] as never);

    const preview = await previewAudience(
      { audienceKind: "BRANCHES", branchIds: ["accra"], employeeIds: [] },
      ALL,
    );

    expect(preview).toEqual({ ok: true, recipients: 3, withApp: 2, withoutApp: 1 });
  });

  it("applies the same scope rule as sending", async () => {
    vi.spyOn(prisma.employee, "findMany").mockResolvedValueOnce([employee("esi", ["tema"])] as never);

    const preview = await previewAudience({ audienceKind: "BRANCHES", branchIds: ["tema"], employeeIds: [] }, ACCRA);

    expect(preview).toEqual({ ok: false, error: "BRANCH_OUT_OF_SCOPE" });
  });
});

describe("announcement Server Actions", () => {
  function form(entries: Record<string, string | string[]>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(entries)) {
      for (const v of Array.isArray(value) ? value : [value]) data.append(key, v);
    }
    return data;
  }

  const actor = {
    userId: "user_1",
    name: "Efua HR",
    email: "hr@basilissa.invalid",
    status: "ACTIVE",
    assignments: [],
  } as never;

  beforeEach(() => vi.restoreAllMocks());

  it("is guarded: a caller without announcement:write never reaches the service", async () => {
    vi.spyOn(identityModule, "requireAnyBranchPermission").mockRejectedValueOnce(new Error("REDIRECT:/admin?denied=1"));
    const findMany = vi.spyOn(prisma.employee, "findMany");

    await expect(
      sendAnnouncementAction(undefined, form({ title: "x", body: "y", audienceKind: "ALL" })),
    ).rejects.toThrow("REDIRECT:/admin?denied=1");

    expect(findMany).not.toHaveBeenCalled();
    expect(identityModule.requireAnyBranchPermission).toHaveBeenCalledWith("announcement:write");
  });

  it("the preview action is guarded the same way", async () => {
    vi.spyOn(identityModule, "requireAnyBranchPermission").mockRejectedValueOnce(new Error("REDIRECT:/admin?denied=1"));
    await expect(
      previewAnnouncementAudienceAction({ audienceKind: "ALL", branchIds: [], employeeIds: [] }),
    ).rejects.toThrow("REDIRECT");
  });

  it("returns field errors for an incomplete form without touching the database", async () => {
    vi.spyOn(identityModule, "requireAnyBranchPermission").mockResolvedValueOnce({ actor, scope: ALL });
    const findMany = vi.spyOn(prisma.employee, "findMany");

    const result = await sendAnnouncementAction(undefined, form({ title: "", body: "", audienceKind: "BRANCHES" }));

    expect(result?.fieldErrors).toMatchObject({ title: expect.any(String), body: expect.any(String), branchIds: expect.any(String) });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("a hand-built request naming a branch outside the sender's scope is refused with a message", async () => {
    vi.spyOn(identityModule, "requireAnyBranchPermission").mockResolvedValueOnce({ actor, scope: ACCRA });
    vi.spyOn(prisma.employee, "findMany").mockResolvedValueOnce([employee("esi", ["tema"])] as never);
    const tx = vi.spyOn(prisma, "$transaction");

    const result = await sendAnnouncementAction(
      undefined,
      form({ title: "Hello", body: "World", audienceKind: "BRANCHES", branchIds: ["tema"] }),
    );

    expect(result?.error).toBe("You can only send to branches you manage.");
    expect(tx).not.toHaveBeenCalled();
  });

  it("on success it redirects to the announcement", async () => {
    vi.spyOn(identityModule, "requireAnyBranchPermission").mockResolvedValueOnce({ actor, scope: ALL });
    vi.spyOn(prisma.employee, "findMany").mockResolvedValueOnce([employee("ama", ["accra"])] as never);
    const stub = transactionStub();
    vi.spyOn(prisma, "$transaction").mockImplementation((async (fn: (client: unknown) => unknown) => fn(stub)) as never);

    await expect(
      sendAnnouncementAction(
        undefined,
        form({ title: "Hello", body: "World", audienceKind: "BRANCHES", branchIds: ["accra"], sendPush: "on" }),
      ),
    ).rejects.toThrow("REDIRECT:/admin/announcements/ann_1");
    expect(stub.job.create).toHaveBeenCalledTimes(1);
  });
});
