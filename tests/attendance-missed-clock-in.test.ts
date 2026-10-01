import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/platform/prisma";
import * as pushModule from "@/lib/platform/push";
import { dispatchMissedClockInReminders } from "@/lib/modules/attendance/jobs";

/**
 * "You haven't clocked in", 15 minutes after a shift starts. The schedule rules
 * (leave, holidays) are the ones that already decide whether someone is expected
 * at work, so those cases are tested through them rather than re-implemented.
 */

const SHIFT = { id: "shift_m", name: "Morning", startMinute: 480, endMinute: 960, unpaidBreakMinutes: 60, offOnPublicHolidays: false };
const EVERY_DAY = [{ shiftId: "shift_m", daysOfWeek: [1, 2, 3, 4, 5, 6, 7], validFrom: new Date("2026-01-01T00:00:00Z"), validTo: null }];
// 08:00 Accra (UTC) on Thursday 10 Sept 2026
const at = (hhmm: string) => new Date(`2026-09-10T${hhmm}:00.000Z`);

function loader(overrides: Record<string, unknown> = {}) {
  return vi.fn().mockResolvedValue({
    timeZone: "Africa/Accra",
    shifts: [SHIFT],
    assignments: EVERY_DAY,
    exceptions: [],
    holidays: new Set<string>(),
    patterns: [],
    ...overrides,
  });
}

describe("dispatchMissedClockInReminders", () => {
  const push = () => vi.mocked(pushModule.sendEmployeePushNotification);
  const job = () => vi.mocked(prisma.job.create);
  const inbox = () => vi.mocked(prisma.notification.createMany);

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(prisma.employee, "findMany").mockResolvedValue([
      {
        id: "emp_1",
        firstName: "Ama",
        branchAssignments: [{ isPrimary: true, branch: { id: "b1", name: "Accra Mall", timezone: "Africa/Accra" } }],
      },
    ] as never);
    vi.spyOn(prisma.attendanceDay, "findFirst").mockResolvedValue(null);
    vi.spyOn(prisma.job, "findFirst").mockResolvedValue(null);
    vi.spyOn(prisma.job, "create").mockResolvedValue({} as never);
    vi.spyOn(pushModule, "sendEmployeePushNotification").mockResolvedValue({ dispatched: 1, receipts: [] });
    vi.spyOn(prisma.notification, "createMany").mockResolvedValue({ count: 1 } as never);
  });

  it("nudges someone 20 minutes after their shift started who has not clocked in", async () => {
    const summary = await dispatchMissedClockInReminders(at("08:20"), loader());

    expect(summary).toMatchObject({ remindersDispatched: 1, skippedClockedIn: 0 });
    expect(push()).toHaveBeenCalledWith(
      "emp_1",
      expect.objectContaining({
        title: "You haven't clocked in",
        body: expect.stringContaining("started at 08:00"),
        data: expect.objectContaining({ type: "MISSED_CLOCK_IN" }),
      }),
    );
    expect(job().mock.calls[0]![0].data).toMatchObject({ type: "attendance:missed-clock-in" });
    expect(inbox().mock.calls[0]![0]!.data).toEqual([expect.objectContaining({ employeeId: "emp_1", kind: "SHIFT_REMINDER" })]);
  });

  it("does not nudge before 15 minutes have passed, or after 45", async () => {
    await dispatchMissedClockInReminders(at("08:10"), loader());
    await dispatchMissedClockInReminders(at("08:50"), loader());
    expect(push()).not.toHaveBeenCalled();
  });

  it("does not nudge someone who has clocked in, however they did it", async () => {
    vi.spyOn(prisma.attendanceDay, "findFirst").mockResolvedValue({ id: "day_1" } as never);
    const summary = await dispatchMissedClockInReminders(at("08:20"), loader());
    expect(summary).toMatchObject({ remindersDispatched: 0, skippedClockedIn: 1 });
    expect(push()).not.toHaveBeenCalled();
  });

  it("does not nudge someone on approved leave (a day-off override for the date)", async () => {
    const exceptions = [{ dateKey: "2026-09-10", type: "DAY_OFF", shiftId: null, branchId: null }];
    await dispatchMissedClockInReminders(at("08:20"), loader({ exceptions }));
    expect(push()).not.toHaveBeenCalled();
  });

  it("does not nudge on a public holiday for an office-hours shift", async () => {
    await dispatchMissedClockInReminders(
      at("08:20"),
      loader({ shifts: [{ ...SHIFT, offOnPublicHolidays: true }], holidays: new Set(["2026-09-10"]) }),
    );
    expect(push()).not.toHaveBeenCalled();
  });

  it("does not nudge someone with no shift today", async () => {
    await dispatchMissedClockInReminders(at("08:20"), loader({ assignments: [] }));
    expect(push()).not.toHaveBeenCalled();
  });

  it("sends once per shift: a second sweep finds the record and skips", async () => {
    vi.spyOn(prisma.job, "findFirst").mockResolvedValue({ id: "job_1" } as never);
    const summary = await dispatchMissedClockInReminders(at("08:20"), loader());
    expect(summary).toMatchObject({ remindersDispatched: 0, skippedAlreadySent: 1 });
    expect(push()).not.toHaveBeenCalled();
  });
});
