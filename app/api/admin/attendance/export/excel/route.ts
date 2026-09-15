import { type NextRequest, NextResponse } from "next/server";
import { requireAnyBranchPermission } from "@/lib/modules/identity/server";
import {
  getTimesheetSummary,
  getTimesheetDetailedLogs,
  buildPayrollTimesheetWorkbook,
} from "@/lib/modules/attendance/server";
import { dateKeyInZone } from "@/lib/platform/date";
import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { actor, scope } = await requireAnyBranchPermission("attendance:read");

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const todayKey = dateKeyInZone(now, DISPLAY_TIMEZONE);

  // Default to Monday of current week
  const dayOfWeek = now.getDay();
  const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon);
  const defaultStartDate = dateKeyInZone(monday, DISPLAY_TIMEZONE);

  const startDate = searchParams.get("startDate") || defaultStartDate;
  const endDate = searchParams.get("endDate") || todayKey;
  const branchId = searchParams.get("branchId") || undefined;
  const search = searchParams.get("search") || undefined;

  const filters = { startDate, endDate, branchId, search };

  const [summary, detailedLogs] = await Promise.all([
    getTimesheetSummary(scope, filters),
    getTimesheetDetailedLogs(scope, filters),
  ]);

  const buffer = await buildPayrollTimesheetWorkbook(summary, detailedLogs, {
    exportedBy: actor.email,
    companyName: "Basilissa Operations",
    generatedAt: now,
  });

  const filename = `basilissa-payroll-timesheet-${startDate}-to-${endDate}.xlsx`;

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
