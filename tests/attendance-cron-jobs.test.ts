import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  dispatchUpcomingShiftReminders,
  runDailySettlementSweep,
} from "@/lib/modules/attendance/jobs";
import { POST as cronPost } from "@/lib/../app/api/cron/attendance/route";
import { prisma } from "@/lib/platform/prisma";
import * as pushModule from "@/lib/platform/push";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Attendance Background Jobs & Cron", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("dispatchUpcomingShiftReminders", () => {
    it("dispatches push reminder for an employee shift starting in 30 minutes", async () => {
      const now = new Date("2026-09-10T07:30:00.000Z"); // 07:30 UTC

      // Employee with active mobile device
      vi.spyOn(prisma.employee, "findMany").mockResolvedValueOnce([
        {
          id: "emp_1",
          firstName: "Ama",
          lastName: "Osei",
          branchAssignments: [
            {
              branchId: "branch_1",
              isPrimary: true,
              branch: { id: "branch_1", name: "Accra Mall", timezone: "Africa/Accra" },
            },
          ],
        },
      ] as never);

      const mockLoader = vi.fn().mockResolvedValue({
        timeZone: "Africa/Accra",
        shifts: [{ id: "shift_m", name: "Morning", startMinute: 480, endMinute: 960, unpaidBreakMinutes: 60 }],
        assignments: [
          {
            shiftId: "shift_m",
            daysOfWeek: [4], // Thursday (2026-09-10 is Thursday)
            validFrom: new Date("2026-01-01"),
            validTo: null,
          },
        ],
        exceptions: [],
      });

      // Not already sent
      vi.spyOn(prisma.job, "findFirst").mockResolvedValueOnce(null);
      const createJobSpy = vi.spyOn(prisma.job, "create").mockResolvedValueOnce({} as never);
      const pushSpy = vi.spyOn(pushModule, "sendEmployeePushNotification").mockResolvedValueOnce({
        dispatched: 1,
        receipts: [{ ok: true, token: "ExponentPushToken[xxx]" }],
      });

      const summary = await dispatchUpcomingShiftReminders(now, mockLoader);

      expect(summary.examined).toBe(1);
      expect(summary.remindersDispatched).toBe(1);
      expect(summary.skippedAlreadySent).toBe(0);

      expect(createJobSpy).toHaveBeenCalledTimes(1);
      expect(pushSpy).toHaveBeenCalledWith(
        "emp_1",
        expect.objectContaining({
          title: "Upcoming Shift Reminder",
          body: expect.stringContaining("Morning"),
        }),
      );
    });

    it("skips if reminder was already recorded/sent for the shift", async () => {
      const now = new Date("2026-09-10T07:30:00.000Z");

      vi.spyOn(prisma.employee, "findMany").mockResolvedValueOnce([
        {
          id: "emp_1",
          firstName: "Ama",
          lastName: "Osei",
          branchAssignments: [
            {
              branchId: "branch_1",
              isPrimary: true,
              branch: { id: "branch_1", name: "Accra Mall", timezone: "Africa/Accra" },
            },
          ],
        },
      ] as never);

      const mockLoader = vi.fn().mockResolvedValue({
        timeZone: "Africa/Accra",
        shifts: [{ id: "shift_m", name: "Morning", startMinute: 480, endMinute: 960, unpaidBreakMinutes: 60 }],
        assignments: [
          {
            shiftId: "shift_m",
            daysOfWeek: [4],
            validFrom: new Date("2026-01-01"),
            validTo: null,
          },
        ],
        exceptions: [],
      });

      // Already sent in jobs table
      vi.spyOn(prisma.job, "findFirst").mockResolvedValueOnce({ id: "job_existing" } as never);
      const pushSpy = vi.spyOn(pushModule, "sendEmployeePushNotification");

      const summary = await dispatchUpcomingShiftReminders(now, mockLoader);

      expect(summary.remindersDispatched).toBe(0);
      expect(summary.skippedAlreadySent).toBe(1);
      expect(pushSpy).not.toHaveBeenCalled();
    });
  });

  describe("runDailySettlementSweep", () => {
    it("sweeps open days from previous dates and settles them", async () => {
      const now = new Date("2026-09-10T12:00:00.000Z");

      vi.spyOn(prisma.attendanceDay, "findMany").mockResolvedValueOnce([
        {
          employeeId: "emp_1",
          branchId: "branch_1",
          workDate: new Date("2026-09-09T00:00:00.000Z"),
        },
      ] as never);

      const mockSettle = vi.fn().mockResolvedValue({ status: "SETTLED" });

      const summary = await runDailySettlementSweep(now, 200, mockSettle as never);

      expect(mockSettle).toHaveBeenCalledTimes(1);

      expect(summary.examined).toBe(1);
      expect(summary.settled).toBe(1);
    });
  });

  describe("Attendance Cron Route (/api/cron/attendance)", () => {
    it("rejects request when CRON_SECRET is set and auth header is invalid", async () => {
      process.env.CRON_SECRET = "super-secret-cron-key";

      const req = new NextRequest("http://localhost:3000/api/cron/attendance", {
        method: "POST",
        headers: { Authorization: "Bearer wrong-key" },
      });

      const res = await cronPost(req);
      expect(res.status).toBe(401);

      delete process.env.CRON_SECRET;
    });

    it("triggers auto-close, reminders, and settlement sweeps when authorized", async () => {
      process.env.CRON_SECRET = "super-secret-cron-key";

      // Mock sweeps
      vi.spyOn(prisma.attendanceDay, "findMany").mockResolvedValue([]);
      vi.spyOn(prisma.employee, "findMany").mockResolvedValue([]);

      const req = new NextRequest("http://localhost:3000/api/cron/attendance", {
        method: "POST",
        headers: { Authorization: "Bearer super-secret-cron-key" },
      });

      const res = await cronPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.results).toHaveProperty("autoClose");
      expect(data.results).toHaveProperty("reminders");
      expect(data.results).toHaveProperty("settlement");

      delete process.env.CRON_SECRET;
    });
  });
});
