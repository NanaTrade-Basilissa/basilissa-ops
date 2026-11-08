"use server";

import { revalidatePath } from "next/cache";
import { MasterSource } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { recordAudit } from "@/lib/platform/audit";
import { auditActorFrom, requirePermission } from "@/lib/modules/identity/server";
import { getOdooConnectionStatus } from "./client";
import { syncAttendanceToOdoo, syncEmployeesFromOdoo } from "./jobs";
import type {
  OdooAttendanceSyncSummary,
  OdooConnectionStatus,
  OdooEmployeeSyncSummary,
} from "./constants";

export async function testOdooConnectionAction(): Promise<OdooConnectionStatus> {
  await requirePermission("odoo:read");
  return getOdooConnectionStatus();
}

export async function syncOdooEmployeesAction(): Promise<OdooEmployeeSyncSummary> {
  const actor = await requirePermission("odoo:manage");
  const result = await syncEmployeesFromOdoo();

  await recordAudit({
    actor: auditActorFrom(actor),
    action: "odoo.employees_synced",
    entityType: "OdooIntegration",
    entityId: "employees",
    after: {
      modelUsed: result.modelUsed,
      totalFetched: result.totalFetched,
      linkedExisting: result.linkedExisting,
      updatedExisting: result.updatedExisting,
      createdNew: result.createdNew,
      skipped: result.skipped,
      errorCount: result.errors.length,
    },
  });

  revalidatePath("/admin/odoo");
  revalidatePath("/admin/employees");

  return result;
}

export async function syncOdooAttendanceAction(input?: {
  dateKey?: string;
  lookbackDays?: number;
}): Promise<OdooAttendanceSyncSummary> {
  const actor = await requirePermission("odoo:manage");
  const result = await syncAttendanceToOdoo({
    dateKey: input?.dateKey || undefined,
    lookbackDays: input?.lookbackDays ?? 7,
  });

  await recordAudit({
    actor: auditActorFrom(actor),
    action: "odoo.attendance_synced",
    entityType: "OdooIntegration",
    entityId: input?.dateKey || "lookback-7d",
    after: {
      examined: result.examined,
      created: result.created,
      updated: result.updated,
      alreadySynced: result.alreadySynced,
      skipped: result.skipped,
      failed: result.failed,
    },
  });

  revalidatePath("/admin/odoo");
  revalidatePath("/admin/attendance");

  return result;
}

export async function retryOdooAttendanceDayAction(
  attendanceDayId: string,
): Promise<OdooAttendanceSyncSummary> {
  const actor = await requirePermission("odoo:manage");
  const result = await syncAttendanceToOdoo({
    attendanceDayIds: [attendanceDayId],
  });

  await recordAudit({
    actor: auditActorFrom(actor),
    action: "odoo.attendance_day_retried",
    entityType: "AttendanceDay",
    entityId: attendanceDayId,
    after: {
      created: result.created,
      updated: result.updated,
      alreadySynced: result.alreadySynced,
      failed: result.failed,
    },
  });

  revalidatePath("/admin/odoo");
  revalidatePath("/admin/attendance");

  return result;
}

export async function linkEmployeeOdooIdAction(
  employeeId: string,
  odooEmployeeIdRaw: string,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await requirePermission("odoo:manage");
  const trimmed = odooEmployeeIdRaw.trim();
  const nextOdooId = trimmed.length > 0 ? trimmed : null;

  if (nextOdooId && !/^\d+$/.test(nextOdooId)) {
    return { ok: false, error: "Odoo Employee ID must be a positive integer (e.g. 2, 45)." };
  }

  const existing = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, odooEmployeeId: true, masterSource: true },
  });

  if (!existing) {
    return { ok: false, error: "Employee not found." };
  }

  if (nextOdooId) {
    const conflict = await prisma.employee.findFirst({
      where: {
        odooEmployeeId: nextOdooId,
        id: { not: employeeId },
      },
      select: { firstName: true, lastName: true, employeeCode: true },
    });
    if (conflict) {
      return {
        ok: false,
        error: `Odoo ID #${nextOdooId} is already linked to ${conflict.firstName} ${conflict.lastName} (${conflict.employeeCode}).`,
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id: employeeId },
      data: {
        odooEmployeeId: nextOdooId,
        masterSource: nextOdooId ? MasterSource.ODOO : MasterSource.LOCAL,
      },
    });

    await recordAudit(
      {
        actor: auditActorFrom(actor),
        action: "employee.odoo_linked",
        entityType: "Employee",
        entityId: employeeId,
        before: { odooEmployeeId: existing.odooEmployeeId, masterSource: existing.masterSource },
        after: {
          odooEmployeeId: nextOdooId,
          masterSource: nextOdooId ? MasterSource.ODOO : MasterSource.LOCAL,
        },
      },
      tx,
    );
  });

  revalidatePath("/admin/odoo");
  revalidatePath("/admin/employees");

  return { ok: true };
}
