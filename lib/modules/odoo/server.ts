import "server-only";
import { OdooSyncStatus } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { getOdooConnectionStatus } from "./client";
import { resolveEffectiveOdooAttendanceWindow } from "./policy";
import {
  runNightlyOdooSyncSweep,
  syncAttendanceToOdoo,
  syncEmployeesFromOdoo,
} from "./jobs";

export {
  getOdooConnectionStatus,
  runNightlyOdooSyncSweep,
  syncAttendanceToOdoo,
  syncEmployeesFromOdoo,
};

export type OdooEmployeeMappingRow = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  odooEmployeeId: string | null;
  masterSource: "LOCAL" | "ODOO";
  status: string;
};

export type OdooAttendanceDayRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  odooEmployeeId: string | null;
  workDate: string;
  status: string;
  actualInIso: string | null;
  actualOutIso: string | null;
  scheduledEndIso: string | null;
  overtimeMinutes: number;
  payableOvertimeMinutes: number;
  effectiveCheckInUtc: string | null;
  effectiveCheckOutUtc: string | null;
  cappedAtScheduledEnd: boolean;
  includesApprovedOvertime: boolean;
  odooAttendanceId: number | null;
  odooSyncStatus: OdooSyncStatus;
  odooSyncedAtIso: string | null;
  odooSyncError: string | null;
};

export async function getOdooDashboardData() {
  const [connection, employees, rawDays, syncGroupCounts] = await Promise.all([
    getOdooConnectionStatus(),
    prisma.employee.findMany({
      orderBy: [{ status: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        jobTitle: true,
        email: true,
        phone: true,
        odooEmployeeId: true,
        masterSource: true,
        status: true,
      },
    }),
    prisma.attendanceDay.findMany({
      where: {
        actualIn: { not: null },
        actualOut: { not: null },
      },
      orderBy: [{ workDate: "desc" }, { updatedAt: "desc" }],
      take: 60,
    }),
    prisma.attendanceDay.groupBy({
      by: ["odooSyncStatus"],
      where: {
        actualIn: { not: null },
        actualOut: { not: null },
      },
      _count: { _all: true },
    }),
  ]);

  const employeeMap = new Map(employees.map((e) => [e.id, e]));

  const attendanceRows: OdooAttendanceDayRow[] = rawDays.map((day) => {
    const emp = employeeMap.get(day.employeeId);
    const window = resolveEffectiveOdooAttendanceWindow({
      actualIn: day.actualIn,
      actualOut: day.actualOut,
      scheduledStart: day.scheduledStart,
      scheduledEnd: day.scheduledEnd,
      overtimeMinutes: day.overtimeMinutes,
      payableOvertimeMinutes: day.payableOvertimeMinutes,
    });

    return {
      id: day.id,
      employeeId: day.employeeId,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : day.employeeId,
      employeeCode: emp?.employeeCode ?? "—",
      odooEmployeeId: emp?.odooEmployeeId ?? null,
      workDate: day.workDate.toISOString().slice(0, 10),
      status: day.status,
      actualInIso: day.actualIn ? day.actualIn.toISOString() : null,
      actualOutIso: day.actualOut ? day.actualOut.toISOString() : null,
      scheduledEndIso: day.scheduledEnd ? day.scheduledEnd.toISOString() : null,
      overtimeMinutes: day.overtimeMinutes,
      payableOvertimeMinutes: day.payableOvertimeMinutes,
      effectiveCheckInUtc: window.ok ? window.checkInUtc : null,
      effectiveCheckOutUtc: window.ok ? window.checkOutUtc : null,
      cappedAtScheduledEnd: window.ok ? window.cappedAtScheduledEnd : false,
      includesApprovedOvertime: window.ok ? window.includesApprovedOvertime : false,
      odooAttendanceId: day.odooAttendanceId,
      odooSyncStatus: day.odooSyncStatus,
      odooSyncedAtIso: day.odooSyncedAt ? day.odooSyncedAt.toISOString() : null,
      odooSyncError: day.odooSyncError,
    };
  });

  const countFor = (status: OdooSyncStatus) =>
    syncGroupCounts.find((g) => g.odooSyncStatus === status)?._count._all ?? 0;

  const linkedCount = employees.filter((e) => Boolean(e.odooEmployeeId)).length;

  return {
    connection,
    employeeStats: {
      total: employees.length,
      linked: linkedCount,
      unlinked: employees.length - linkedCount,
    },
    attendanceStats: {
      pending: countFor(OdooSyncStatus.PENDING),
      synced: countFor(OdooSyncStatus.SYNCED),
      failed: countFor(OdooSyncStatus.FAILED),
      skipped: countFor(OdooSyncStatus.SKIPPED),
    },
    employees: employees as OdooEmployeeMappingRow[],
    recentDays: attendanceRows,
  };
}
