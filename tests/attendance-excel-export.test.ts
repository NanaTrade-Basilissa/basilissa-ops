import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildPayrollTimesheetWorkbook } from "@/lib/modules/attendance/server";
import type { TimesheetSummaryData, TimesheetDetailedLog } from "@/lib/modules/attendance/queries";

type ExcelBufferInput = Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];

describe("buildPayrollTimesheetWorkbook", () => {
  const mockSummary: TimesheetSummaryData = {
    startDate: "2026-09-01",
    endDate: "2026-09-07",
    totalEmployees: 2,
    totalScheduledMinutes: 4800,
    totalWorkedMinutes: 5100,
    totalRegularMinutes: 4800,
    totalOvertimeMinutes: 300,
    totalPayableOvertimeMinutes: 240,
    totalLateMinutes: 45,
    totalExceptions: 1,
    rows: [
      {
        employeeId: "emp_1",
        employeeCode: "EMP-001",
        name: "Akosua Mensah",
        branchId: "branch_accra",
        branchName: "Accra Mall",
        daysScheduled: 5,
        daysWorked: 5,
        scheduledMinutes: 2400,
        netWorkedMinutes: 2550,
        regularMinutes: 2400,
        overtimeMinutes: 150,
        payableOvertimeMinutes: 120,
        lateCount: 1,
        lateMinutes: 15,
        earlyDepartureMinutes: 0,
        exceptionsCount: 1,
      },
      {
        employeeId: "emp_2",
        employeeCode: "EMP-002",
        name: "Kwame Asante",
        branchId: "branch_accra",
        branchName: "Accra Mall",
        daysScheduled: 5,
        daysWorked: 5,
        scheduledMinutes: 2400,
        netWorkedMinutes: 2550,
        regularMinutes: 2400,
        overtimeMinutes: 150,
        payableOvertimeMinutes: 120,
        lateCount: 2,
        lateMinutes: 30,
        earlyDepartureMinutes: 0,
        exceptionsCount: 0,
      },
    ],
  };

  const mockLogs: TimesheetDetailedLog[] = [
    {
      id: "day_1",
      employeeId: "emp_1",
      employeeCode: "EMP-001",
      employeeName: "Akosua Mensah",
      workDate: "2026-09-01",
      branchId: "branch_accra",
      branchName: "Accra Mall",
      shiftName: "Morning Shift",
      scheduledStart: "08:00",
      scheduledEnd: "16:00",
      actualIn: "08:15",
      actualOut: "17:15",
      scheduledMinutes: 480,
      grossMinutes: 540,
      netWorkedMinutes: 540,
      regularMinutes: 480,
      overtimeMinutes: 60,
      payableOvertimeMinutes: 60,
      lateMinutes: 15,
      earlyDepartureMinutes: 0,
      status: "NEEDS_REVIEW",
      flags: ["LATE_ARRIVAL", "OVERTIME_PENDING"],
    },
  ];

  it("generates a valid, readable Excel workbook with 2 sheets", async () => {
    const buffer = await buildPayrollTimesheetWorkbook(mockSummary, mockLogs, {
      exportedBy: "Admin User",
      companyName: "Basilissa Test Corp",
      generatedAt: new Date("2026-09-10T12:00:00Z"),
    });

    expect(buffer).toBeDefined();
    expect(buffer.byteLength).toBeGreaterThan(0);

    // Read back workbook
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelBufferInput);

    expect(workbook.worksheets.length).toBe(2);
    expect(workbook.getWorksheet("Payroll Summary")).toBeDefined();
    expect(workbook.getWorksheet("Daily Logs")).toBeDefined();
  });

  it("populates the Payroll Summary worksheet correctly", async () => {
    const buffer = await buildPayrollTimesheetWorkbook(mockSummary, mockLogs, {
      exportedBy: "Admin User",
      companyName: "Basilissa Test Corp",
      generatedAt: new Date("2026-09-10T12:00:00Z"),
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelBufferInput);
    const sheet = workbook.getWorksheet("Payroll Summary")!;

    // Title
    expect(sheet.getCell("A1").value?.toString()).toContain("Basilissa Test Corp — Payroll & Timesheet Summary");
    // Subtitle
    expect(sheet.getCell("A2").value?.toString()).toContain("Pay Period: 2026-09-01 to 2026-09-07");

    // Check header row 5
    expect(sheet.getCell("A5").value).toBe("Emp Code");
    expect(sheet.getCell("B5").value).toBe("Employee Name");
    expect(sheet.getCell("L5").value).toBe("Payable OT (Hrs)");

    // Check row 6 (first employee: Akosua Mensah)
    expect(sheet.getCell("A6").value).toBe("EMP-001");
    expect(sheet.getCell("B6").value).toBe("Akosua Mensah");
    expect(sheet.getCell("C6").value).toBe("Accra Mall");
    expect(sheet.getCell("F6").value).toBe(5); // days scheduled
    expect(sheet.getCell("H6").value).toBe(40); // 2400 mins = 40.00 hrs
    expect(sheet.getCell("L6").value).toBe(2); // 120 mins payable OT = 2.00 hrs

    // Check row 7 (second employee: Kwame Asante)
    expect(sheet.getCell("A7").value).toBe("EMP-002");
    expect(sheet.getCell("B7").value).toBe("Kwame Asante");

    // Row 8 is the summary row
    const summaryRow = sheet.getRow(8);
    expect(summaryRow.getCell(1).value).toBe("TOTALS");
    // Check formula on column F (Days Sched)
    expect(summaryRow.getCell(6).value).toEqual({ formula: "SUM(F6:F7)" });
  });

  it("populates the Daily Logs worksheet correctly", async () => {
    const buffer = await buildPayrollTimesheetWorkbook(mockSummary, mockLogs, {
      exportedBy: "Admin User",
      companyName: "Basilissa Test Corp",
      generatedAt: new Date("2026-09-10T12:00:00Z"),
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelBufferInput);
    const sheet = workbook.getWorksheet("Daily Logs")!;

    // Header row 1
    expect(sheet.getCell("A1").value).toBe("Work Date");
    expect(sheet.getCell("B1").value).toBe("Emp Code");
    expect(sheet.getCell("C1").value).toBe("Employee Name");

    // Row 2 (first log)
    expect(sheet.getCell("A2").value).toBe("2026-09-01");
    expect(sheet.getCell("B2").value).toBe("EMP-001");
    expect(sheet.getCell("C2").value).toBe("Akosua Mensah");
    expect(sheet.getCell("H2").value).toBe("08:15");
    expect(sheet.getCell("I2").value).toBe("17:15");
    expect(sheet.getCell("L2").value).toBe(1); // 60 mins overtime = 1 hr
    expect(sheet.getCell("M2").value).toBe(1); // 60 mins payable overtime = 1 hr
    expect(sheet.getCell("O2").value).toBe("NEEDS_REVIEW");
    expect(sheet.getCell("P2").value).toBe("LATE_ARRIVAL, OVERTIME_PENDING");
  });

  it("handles empty timesheet data without crashing", async () => {
    const emptySummary: TimesheetSummaryData = {
      startDate: "2026-09-01",
      endDate: "2026-09-07",
      totalEmployees: 0,
      totalScheduledMinutes: 0,
      totalWorkedMinutes: 0,
      totalRegularMinutes: 0,
      totalOvertimeMinutes: 0,
      totalPayableOvertimeMinutes: 0,
      totalLateMinutes: 0,
      totalExceptions: 0,
      rows: [],
    };

    const buffer = await buildPayrollTimesheetWorkbook(emptySummary, []);
    expect(buffer).toBeDefined();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});
