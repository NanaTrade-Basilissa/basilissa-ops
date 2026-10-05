import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/platform/prisma";
import * as identityModule from "@/lib/modules/identity/server";
import { buildRotaWorkbook, describeDay, shiftMinutes, clock } from "@/lib/modules/employees/server";
import type { EmployeeDaySchedule, WeeklyScheduleData } from "@/lib/modules/employees/server";
import { GET as exportRoute } from "@/app/api/admin/shifts/export/excel/route";

const day = (over: Partial<EmployeeDaySchedule> = {}): EmployeeDaySchedule => ({
  dateKey: "2026-09-07", shiftId: "m", shiftName: "Morning", startMinute: 480, endMinute: 960, isException: false, ...over,
});

const DATA: WeeklyScheduleData = {
  branchId: "b1", branchName: "Accra Mall", autoRota: false, weekStartKey: "2026-09-07",
  days: ["2026-09-07", "2026-09-08", "2026-09-09"].map((dateKey, i) => ({
    dateKey, dayName: ["Mon", "Tue", "Wed"][i]!, formattedDay: `${7 + i} Sep`, isoWeekday: i + 1, holidayName: i === 2 ? "Founders Day" : null,
  })),
  shifts: [{ id: "m", name: "Morning", startMinute: 480, endMinute: 960 }, { id: "n", name: "Night", startMinute: 1320, endMinute: 360 }],
  employees: [
    {
      employeeId: "e1", name: "Ama Osei", employeeCode: "EMP1", jobTitle: "Cashier", isVisitor: false, homeBranchName: "Accra Mall", patternName: null,
      days: {
        "2026-09-07": day(),
        "2026-09-08": day({ dateKey: "2026-09-08", shiftId: "n", shiftName: "Night", startMinute: 1320, endMinute: 360 }),
        "2026-09-09": day({ dateKey: "2026-09-09", shiftId: null, shiftName: null, startMinute: null, endMinute: null }),
      },
    },
    {
      employeeId: "e2", name: "Kofi Visitor", employeeCode: "EMP2", jobTitle: null, isVisitor: true, homeBranchName: "Tema", patternName: null,
      days: { "2026-09-07": day({ coverBranchName: "Accra Mall" }) },
    },
  ],
  coverage: {
    "2026-09-07": { dateKey: "2026-09-07", totalScheduled: 2, totalDayOff: 0, shiftCounts: {} },
    "2026-09-08": { dateKey: "2026-09-08", totalScheduled: 1, totalDayOff: 1, shiftCounts: {} },
    "2026-09-09": { dateKey: "2026-09-09", totalScheduled: 0, totalDayOff: 2, shiftCounts: {} },
  },
};

describe("cell text", () => {
  it("formats times and lengths, including a shift that runs past midnight", () => {
    expect(clock(480)).toBe("08:00");
    expect(shiftMinutes(480, 960)).toBe(480);
    expect(shiftMinutes(1320, 360)).toBe(480);
  });
  it("describes a shift, a cover, a day off, leave-style notes and a holiday", () => {
    expect(describeDay(day(), null)).toBe("Morning 08:00-16:00");
    expect(describeDay(day({ coverBranchName: "Tema" }), null)).toBe("Morning 08:00-16:00 (cover at Tema)");
    expect(describeDay(day({ shiftId: null, shiftName: null, startMinute: null, endMinute: null, exceptionType: "DAY_OFF", exceptionReason: "Annual leave" }), null)).toBe("Off (Annual leave)");
    expect(describeDay(undefined, null)).toBe("Off");
    expect(describeDay(undefined, "Founders Day")).toBe("Public holiday");
    expect(describeDay(day({ shiftId: null, shiftName: null, startMinute: null, endMinute: null, isAway: true, coverBranchName: "Tema" }), null)).toBe("Covering at Tema");
  });
});

describe("rota workbook", () => {
  it("has one row per person with a column per day, and totals the days and hours", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildRotaWorkbook(DATA, { exportedBy: "hr@basilissa.invalid", generatedAt: new Date("2026-09-06T10:00:00Z") })) as never);
    const sheet = wb.getWorksheet("Rota")!;

    expect(sheet.getRow(1).getCell(1).value).toBe("Accra Mall: weekly rota");
    const header = sheet.getRow(5).values as unknown[];
    expect(header.slice(1, 4)).toEqual(["Code", "Name", "Job title"]);
    expect(String(header[6])).toContain("Founders Day");

    const ama = sheet.getRow(6).values as unknown[];
    expect(ama.slice(1, 8)).toEqual(["EMP1", "Ama Osei", "Cashier", "Morning 08:00-16:00", "Night 22:00-06:00", "Public holiday", 2]);
    expect(ama[8]).toBe(16); // two 8-hour shifts, the second past midnight

    const visitor = sheet.getRow(7).values as unknown[];
    expect(String(visitor[2])).toContain("visiting from Tema");
    expect(visitor[4]).toBe("Morning 08:00-16:00 (cover at Accra Mall)");

    const coverage = sheet.getRow(8).values as unknown[];
    expect(coverage.slice(4, 7)).toEqual([2, 1, 0]);
  });

  it("lists the shift templates as a key", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildRotaWorkbook(DATA)) as never);
    const key = wb.getWorksheet("Shifts")!;
    expect((key.getRow(3).values as unknown[]).slice(1)).toEqual(["Night", "22:00", "06:00", 8]);
  });
});

describe("GET /api/admin/shifts/export/excel", () => {
  beforeEach(() => vi.restoreAllMocks());
  const actor = { userId: "u1", email: "hr@basilissa.invalid", name: "HR", status: "ACTIVE", assignments: [] } as never;
  const call = (q: string) => exportRoute(new NextRequest(`http://localhost/api/admin/shifts/export/excel${q}`));

  it("is guarded by schedule:read", async () => {
    const guard = vi.spyOn(identityModule, "requireAnyBranchPermission").mockRejectedValueOnce(new Error("REDIRECT"));
    await expect(call("?branchId=b1&week=2026-09-07")).rejects.toThrow("REDIRECT");
    expect(guard).toHaveBeenCalledWith("schedule:read");
  });

  it("needs a branch and a week", async () => {
    vi.spyOn(identityModule, "requireAnyBranchPermission").mockResolvedValue({ actor, scope: { kind: "all" } });
    expect((await call("")).status).toBe(400);
    expect((await call("?branchId=b1&week=soon")).status).toBe(400);
  });

  it("answers 404 for a branch outside the caller's scope, without loading anything", async () => {
    vi.spyOn(identityModule, "requireAnyBranchPermission").mockResolvedValue({ actor, scope: { kind: "branches", branchIds: ["b1"] } });
    const find = vi.spyOn(prisma.branch, "findUnique");
    expect((await call("?branchId=other&week=2026-09-07")).status).toBe(404);
    expect(find).not.toHaveBeenCalled();
  });
});
