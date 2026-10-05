import "server-only";
import ExcelJS from "exceljs";
import type { EmployeeDaySchedule, WeeklyScheduleData } from "./schedule-repository";

/**
 * The weekly rota as a spreadsheet: one row per person, one column per day,
 * exactly what the Weekly Rota grid shows, so a manager can print it, post it or
 * send it on. Read-only: nothing here changes a schedule.
 */

export type RotaExportMetadata = { exportedBy?: string; generatedAt?: Date };

const pad = (n: number) => String(n).padStart(2, "0");
export const clock = (minute: number) => `${pad(Math.floor(minute / 60) % 24)}:${pad(minute % 60)}`;

/** Scheduled length of a shift, counting an overnight shift past midnight. Breaks are not deducted. */
export function shiftMinutes(startMinute: number, endMinute: number): number {
  return endMinute > startMinute ? endMinute - startMinute : endMinute + 1440 - startMinute;
}

/** What one cell says. Pure, so every case is testable. */
export function describeDay(day: EmployeeDaySchedule | undefined, holidayName: string | null): string {
  if (!day || day.shiftId === null || day.startMinute === null || day.endMinute === null) {
    if (day?.isAway && day.coverBranchName) return `Covering at ${day.coverBranchName}`;
    if (day?.exceptionType === "DAY_OFF") return day.exceptionReason ? `Off (${day.exceptionReason})` : "Off";
    return holidayName ? "Public holiday" : "Off";
  }
  const base = `${day.shiftName ?? "Shift"} ${clock(day.startMinute)}-${clock(day.endMinute)}`;
  return day.coverBranchName ? `${base} (cover at ${day.coverBranchName})` : base;
}

export async function buildRotaWorkbook(data: WeeklyScheduleData, metadata: RotaExportMetadata = {}): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Basilissa Operations";
  workbook.lastModifiedBy = metadata.exportedBy || "System";
  workbook.created = metadata.generatedAt || new Date();

  const first = data.days[0]!;
  const last = data.days[data.days.length - 1]!;
  const sheet = workbook.addWorksheet("Rota", { views: [{ state: "frozen", ySplit: 5, xSplit: 2 }] });

  const columns = 3 + data.days.length + 2; // code, name, role, days, days worked, hours
  sheet.addRow([`${data.branchName}: weekly rota`]).font = { bold: true, size: 14 };
  sheet.addRow([`${first.formattedDay} to ${last.formattedDay} (${first.dateKey} to ${last.dateKey})`]);
  sheet.addRow([
    `Exported ${(metadata.generatedAt || new Date()).toISOString().slice(0, 16).replace("T", " ")} UTC${metadata.exportedBy ? ` by ${metadata.exportedBy}` : ""}`,
  ]).font = { color: { argb: "FF71717A" }, italic: true };
  sheet.addRow([]);

  const header = sheet.addRow([
    "Code",
    "Name",
    "Job title",
    ...data.days.map((d) => `${d.dayName} ${d.formattedDay}${d.holidayName ? `\n${d.holidayName}` : ""}`),
    "Days worked",
    "Scheduled hours",
  ]);
  header.height = 34;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF18181B" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  for (const person of data.employees) {
    let worked = 0;
    let minutes = 0;
    const cells = data.days.map((day) => {
      const entry = person.days[day.dateKey];
      if (entry && entry.shiftId !== null && entry.startMinute !== null && entry.endMinute !== null) {
        worked++;
        minutes += shiftMinutes(entry.startMinute, entry.endMinute);
      }
      return describeDay(entry, day.holidayName);
    });
    const row = sheet.addRow([
      person.employeeCode ?? "",
      person.isVisitor ? `${person.name} (visiting from ${person.homeBranchName ?? "another branch"})` : person.name,
      person.jobTitle ?? "",
      ...cells,
      worked,
      Number((minutes / 60).toFixed(2)),
    ]);
    row.eachCell((cell, col) => {
      cell.alignment = { vertical: "middle", horizontal: col > 3 ? "center" : "left", wrapText: true };
      cell.border = { bottom: { style: "hair", color: { argb: "FFD4D4D8" } } };
      if (col > 3 && col <= 3 + data.days.length && /^(Off|Public holiday|Covering)/.test(String(cell.value))) {
        cell.font = { color: { argb: "FF71717A" } };
      }
    });
    if (person.isVisitor) row.font = { italic: true };
  }

  // Who is in each day, so a gap is visible at a glance.
  const coverage = sheet.addRow([
    "",
    "Staff scheduled",
    "",
    ...data.days.map((d) => data.coverage[d.dateKey]?.totalScheduled ?? 0),
    "",
    "",
  ]);
  coverage.font = { bold: true };
  coverage.eachCell((cell) => {
    cell.border = { top: { style: "thin" } };
    cell.alignment = { horizontal: "center" };
  });

  sheet.getColumn(1).width = 12;
  sheet.getColumn(2).width = 28;
  sheet.getColumn(3).width = 18;
  for (let i = 0; i < data.days.length; i++) sheet.getColumn(4 + i).width = 22;
  sheet.getColumn(columns - 1).width = 12;
  sheet.getColumn(columns).width = 16;
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  // The shift templates in play, as a key.
  const key = workbook.addWorksheet("Shifts");
  const keyHeader = key.addRow(["Shift", "Starts", "Ends", "Length (hours)"]);
  keyHeader.font = { bold: true };
  for (const shift of data.shifts) {
    key.addRow([shift.name, clock(shift.startMinute), clock(shift.endMinute), Number((shiftMinutes(shift.startMinute, shift.endMinute) / 60).toFixed(2))]);
  }
  key.columns = [{ width: 26 }, { width: 10 }, { width: 10 }, { width: 16 }];

  return workbook.xlsx.writeBuffer();
}
