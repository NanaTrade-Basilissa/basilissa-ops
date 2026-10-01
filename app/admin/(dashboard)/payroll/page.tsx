import type { Metadata } from "next";
import { prisma } from "@/lib/platform/prisma";
import { dateKeyInZone } from "@/lib/platform/date";
import { DISPLAY_TIMEZONE } from "@/lib/platform/constants";
import { requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { getTimesheetSummary } from "@/lib/modules/attendance/server";
import { TimesheetFilters } from "@/components/admin/timesheet-filters";
import { TimesheetsTable } from "@/components/admin/timesheets-table";

export const metadata: Metadata = { title: "Payroll" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Hours worked per employee over a period, the input to payroll. Its own page
 * rather than an attendance tab so it can grow (pay runs, approvals) without
 * crowding the day-to-day attendance screens.
 *
 * Same permission the timesheet tab had, so nobody gains or loses access in
 * the move.
 */
export default async function PayrollPage({ searchParams }: { searchParams: SearchParams }) {
  const { scope } = await requireAnyBranchPermission("attendance:read");
  const raw = await searchParams;

  // Default range: Monday of this week to today.
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + (dayOfWeek === 0 ? -6 : 1 - dayOfWeek));

  const startDate = first(raw.startDate) ?? dateKeyInZone(monday, DISPLAY_TIMEZONE);
  const endDate = first(raw.endDate) ?? dateKeyInZone(now, DISPLAY_TIMEZONE);
  const branchId = first(raw.branchId);
  const search = first(raw.search);

  const [branches, timesheetData] = await Promise.all([
    prisma.branch.findMany({
      where: scope.kind === "branches" ? { id: { in: scope.branchIds } } : {},
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getTimesheetSummary(scope, { startDate, endDate, branchId, search }),
  ]);

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      <TimesheetFilters
        branches={branches}
        startDate={startDate}
        endDate={endDate}
        branchId={branchId}
        search={search}
      />
      <TimesheetsTable data={timesheetData} />
    </div>
  );
}
