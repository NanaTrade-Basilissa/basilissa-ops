import "server-only";
import ExcelJS from "exceljs";
import type { TimesheetSummaryData, TimesheetDetailedLog } from "./queries";

export interface ExportMetadata {
  exportedBy?: string;
  companyName?: string;
  generatedAt?: Date;
}

function toHours(minutes: number): number {
  return Number((minutes / 60).toFixed(2));
}

export async function buildPayrollTimesheetWorkbook(
  summary: TimesheetSummaryData,
  detailedLogs: TimesheetDetailedLog[],
  metadata: ExportMetadata = {},
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = metadata.companyName || "Basilissa Operations Platform";
  workbook.lastModifiedBy = metadata.exportedBy || "System";
  workbook.created = metadata.generatedAt || new Date();
  workbook.modified = metadata.generatedAt || new Date();

  // --------------------------------------------------------------------------
  // SHEET 1: Payroll Summary
  // --------------------------------------------------------------------------
  const summarySheet = workbook.addWorksheet("Payroll Summary", {
    views: [{ state: "frozen", ySplit: 5, xSplit: 2 }],
  });

  // Title Block
  summarySheet.mergeCells("A1:O1");
  const titleCell = summarySheet.getCell("A1");
  titleCell.value = `${metadata.companyName || "Basilissa"} — Payroll & Timesheet Summary`;
  titleCell.font = { name: "Calibri", size: 16, bold: true, color: { argb: "FF0F172A" } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  summarySheet.getRow(1).height = 30;

  // Subtitle / Date Range Info
  summarySheet.mergeCells("A2:O2");
  const subCell = summarySheet.getCell("A2");
  const genDateStr = (metadata.generatedAt || new Date()).toISOString().slice(0, 10);
  subCell.value = `Pay Period: ${summary.startDate} to ${summary.endDate}  |  Generated on: ${genDateStr}  |  Total Staff: ${summary.totalEmployees}`;
  subCell.font = { name: "Calibri", size: 11, italic: true, color: { argb: "FF475569" } };
  summarySheet.getRow(2).height = 20;

  // Empty row 3
  summarySheet.getRow(3).height = 8;

  // Summary Table Headers on Row 5
  const summaryHeaders = [
    { header: "Emp Code", key: "code", width: 14 },
    { header: "Employee Name", key: "name", width: 26 },
    { header: "Branch", key: "branch", width: 22 },
    { header: "Period Start", key: "start", width: 13 },
    { header: "Period End", key: "end", width: 13 },
    { header: "Days Sched.", key: "daysSched", width: 13 },
    { header: "Days Worked", key: "daysWorked", width: 13 },
    { header: "Sched. (Hrs)", key: "schedHrs", width: 14 },
    { header: "Net Worked (Hrs)", key: "workedHrs", width: 16 },
    { header: "Regular (Hrs)", key: "regHrs", width: 14 },
    { header: "Overtime (Hrs)", key: "otHrs", width: 15 },
    { header: "Payable OT (Hrs)", key: "payableOtHrs", width: 16 },
    { header: "Late (Count)", key: "lateCount", width: 13 },
    { header: "Late (Mins)", key: "lateMins", width: 13 },
    { header: "Exceptions", key: "exceptions", width: 13 },
  ];

  summarySheet.getRow(5).values = summaryHeaders.map((h) => h.header);
  summarySheet.getRow(5).height = 26;

  const headerRow = summarySheet.getRow(5);
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E293B" }, // Executive Dark Navy
    };
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF0F172A" } },
      bottom: { style: "medium", color: { argb: "FF0F172A" } },
    };
  });

  // Populate data rows
  let currentSummaryRowIndex = 6;
  for (const row of summary.rows) {
    const dataRow = summarySheet.getRow(currentSummaryRowIndex);
    dataRow.values = [
      row.employeeCode ?? "-",
      row.name,
      row.branchName,
      summary.startDate,
      summary.endDate,
      row.daysScheduled,
      row.daysWorked,
      toHours(row.scheduledMinutes),
      toHours(row.netWorkedMinutes),
      toHours(row.regularMinutes),
      toHours(row.overtimeMinutes),
      toHours(row.payableOvertimeMinutes),
      row.lateCount,
      row.lateMinutes,
      row.exceptionsCount,
    ];
    dataRow.height = 20;

    const isEven = currentSummaryRowIndex % 2 === 0;
    dataRow.eachCell((cell, colNumber) => {
      cell.font = { name: "Calibri", size: 10 };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };

      if (isEven) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
      }

      // Column specific alignment & format
      if (colNumber === 1 || colNumber === 4 || colNumber === 5) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else if (colNumber === 2 || colNumber === 3) {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      } else if (colNumber >= 6 && colNumber <= 7) {
        cell.alignment = { horizontal: "right", vertical: "middle" };
        cell.numFmt = "#,##0";
      } else if (colNumber >= 8 && colNumber <= 12) {
        cell.alignment = { horizontal: "right", vertical: "middle" };
        cell.numFmt = "0.00";
      } else {
        cell.alignment = { horizontal: "right", vertical: "middle" };
        cell.numFmt = "#,##0";
      }
    });

    currentSummaryRowIndex++;
  }

  // Summary Totals Row (if data exists)
  if (summary.rows.length > 0) {
    const totalRow = summarySheet.getRow(currentSummaryRowIndex);
    const lastDataRow = currentSummaryRowIndex - 1;

    totalRow.getCell(1).value = "TOTALS";
    totalRow.getCell(2).value = `${summary.rows.length} Employees`;
    totalRow.getCell(3).value = "";
    totalRow.getCell(4).value = "";
    totalRow.getCell(5).value = "";
    totalRow.getCell(6).value = { formula: `SUM(F6:F${lastDataRow})` };
    totalRow.getCell(7).value = { formula: `SUM(G6:G${lastDataRow})` };
    totalRow.getCell(8).value = { formula: `SUM(H6:H${lastDataRow})` };
    totalRow.getCell(9).value = { formula: `SUM(I6:I${lastDataRow})` };
    totalRow.getCell(10).value = { formula: `SUM(J6:J${lastDataRow})` };
    totalRow.getCell(11).value = { formula: `SUM(K6:K${lastDataRow})` };
    totalRow.getCell(12).value = { formula: `SUM(L6:L${lastDataRow})` };
    totalRow.getCell(13).value = { formula: `SUM(M6:M${lastDataRow})` };
    totalRow.getCell(14).value = { formula: `SUM(N6:N${lastDataRow})` };
    totalRow.getCell(15).value = { formula: `SUM(O6:O${lastDataRow})` };

    totalRow.height = 24;
    totalRow.eachCell((cell, colNumber) => {
      cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF0F172A" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF1F5F9" },
      };
      cell.border = {
        top: { style: "medium", color: { argb: "FF334155" } },
        bottom: { style: "double", color: { argb: "FF334155" } },
      };

      if (colNumber >= 8 && colNumber <= 12) {
        cell.numFmt = "0.00";
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else if (colNumber >= 6) {
        cell.numFmt = "#,##0";
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      }
    });
  }

  // Adjust column widths
  summaryHeaders.forEach((h, index) => {
    summarySheet.getColumn(index + 1).width = h.width;
  });

  // --------------------------------------------------------------------------
  // SHEET 2: Daily Attendance Logs
  // --------------------------------------------------------------------------
  const logsSheet = workbook.addWorksheet("Daily Logs", {
    views: [{ state: "frozen", ySplit: 1, xSplit: 3 }],
  });

  const logHeaders = [
    { header: "Work Date", width: 13 },
    { header: "Emp Code", width: 14 },
    { header: "Employee Name", width: 24 },
    { header: "Branch", width: 22 },
    { header: "Shift", width: 16 },
    { header: "Sched In", width: 11 },
    { header: "Sched Out", width: 11 },
    { header: "Actual In", width: 11 },
    { header: "Actual Out", width: 11 },
    { header: "Net (Hrs)", width: 12 },
    { header: "Regular (Hrs)", width: 13 },
    { header: "Overtime (Hrs)", width: 14 },
    { header: "Payable OT", width: 13 },
    { header: "Late (Mins)", width: 12 },
    { header: "Status", width: 15 },
    { header: "Flags / Exceptions", width: 34 },
  ];

  logsSheet.getRow(1).values = logHeaders.map((h) => h.header);
  logsSheet.getRow(1).height = 25;

  logsSheet.getRow(1).eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF334155" }, // Slate-700
    };
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      bottom: { style: "medium", color: { argb: "FF0F172A" } },
    };
  });

  let currentLogIndex = 2;
  for (const log of detailedLogs) {
    const row = logsSheet.getRow(currentLogIndex);
    row.values = [
      log.workDate,
      log.employeeCode ?? "-",
      log.employeeName,
      log.branchName,
      log.shiftName,
      log.scheduledStart ?? "-",
      log.scheduledEnd ?? "-",
      log.actualIn ?? "-",
      log.actualOut ?? "-",
      toHours(log.netWorkedMinutes),
      toHours(log.regularMinutes),
      toHours(log.overtimeMinutes),
      toHours(log.payableOvertimeMinutes),
      log.lateMinutes,
      log.status,
      log.flags.length > 0 ? log.flags.join(", ") : "-",
    ];
    row.height = 19;

    const isEven = currentLogIndex % 2 === 0;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: "Calibri", size: 10 };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };

      if (isEven) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
      }

      if (colNumber === 1 || colNumber === 2 || (colNumber >= 6 && colNumber <= 9)) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else if (colNumber === 3 || colNumber === 4 || colNumber === 5 || colNumber === 16) {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      } else if (colNumber >= 10 && colNumber <= 13) {
        cell.alignment = { horizontal: "right", vertical: "middle" };
        cell.numFmt = "0.00";
      } else if (colNumber === 14) {
        cell.alignment = { horizontal: "right", vertical: "middle" };
        cell.numFmt = "#,##0";
      } else if (colNumber === 15) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
        // Status highlighting
        if (log.status === "SETTLED") {
          cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF15803D" } };
        } else if (log.status === "NEEDS_REVIEW") {
          cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFB45309" } };
        } else {
          cell.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF64748B" } };
        }
      }
    });

    currentLogIndex++;
  }

  logHeaders.forEach((h, idx) => {
    logsSheet.getColumn(idx + 1).width = h.width;
  });

  return await workbook.xlsx.writeBuffer();
}
