import "server-only";
import { EmploymentStatus, MasterSource, OdooSyncStatus, ProviderType } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import { scoped } from "@/lib/platform/logger";
import { autoCloseStaleDays, runDailySettlementSweep } from "@/lib/modules/attendance/jobs";
import {
  createOdooAttendance,
  createOdooEmployee,
  fetchAllOdooDepartments,
  fetchAllOdooEmployees,
  findConflictingOdooAttendances,
  getOdooEnvConfig,
  OdooApiError,
  updateOdooAttendance,
  updateOdooEmployee,
  type OdooEmployeeWritePayload,
} from "./client";
import {
  findOdooEmployeeMatch,
  matchOdooEmployeeToLocal,
  normalizeEmailKey,
  normalizeOdooEmployee,
  normalizePhoneKey,
  resolveEffectiveOdooAttendanceWindow,
  type LocalEmployeeCandidate,
} from "./policy";
import type {
  OdooAttendanceSyncItemResult,
  OdooAttendanceSyncSummary,
  OdooEmployeeSyncSummary,
} from "./constants";

const log = scoped("odoo:jobs");

function normalizeSlugToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Fetches departments (`hr.department`) and job titles (`hr.employee.job_id`) from Odoo
 * and upserts them into our local `OdooDepartment` and `OdooJobTitle` cache tables.
 */
export async function syncOdooCatalogFromRecords(rawEmployeeRecords?: {
  job_id?: [number, string] | false;
  job_title?: string | false;
  department_id?: [number, string] | false;
}[]): Promise<{ departmentsSynced: number; jobTitlesSynced: number }> {
  const now = new Date();
  let departmentsSynced = 0;
  let jobTitlesSynced = 0;

  // 1. Sync Odoo departments
  try {
    const depts = await fetchAllOdooDepartments();
    for (const d of depts) {
      const name = d.name?.trim();
      if (!name) continue;
      await prisma.odooDepartment.upsert({
        where: { odooId: d.id },
        create: { odooId: d.id, name, isActive: d.active !== false, syncedAt: now },
        update: { name, isActive: d.active !== false, syncedAt: now },
      });
      departmentsSynced++;
    }
  } catch (err) {
    log.warn("Could not fetch hr.department directly from Odoo", { error: String(err) });
  }

  // 2. Sync Odoo job titles from employee records (since hr.job is not exposed on REST)
  const employees = rawEmployeeRecords ?? (await fetchAllOdooEmployees()).records;
  const seenJobIds = new Map<number, string>();
  for (const emp of employees) {
    if (Array.isArray(emp.job_id) && emp.job_id.length >= 2) {
      const id = Number(emp.job_id[0]);
      const name = String(emp.job_id[1] ?? "").trim();
      if (Number.isFinite(id) && name) {
        seenJobIds.set(id, name);
      }
    }
  }

  for (const [odooId, name] of seenJobIds.entries()) {
    await prisma.odooJobTitle.upsert({
      where: { odooId },
      create: { odooId, name, isActive: true, syncedAt: now },
      update: { name, isActive: true, syncedAt: now },
    });
    jobTitlesSynced++;
  }

  return { departmentsSynced, jobTitlesSynced };
}

/**
 * Pulls all employees from Odoo (`hr.employee` or `hr.employee.public`),
 * matches and links existing local employees, updates cached fields, and
 * creates any newly-added Odoo employees locally with their branch assignment.
 */
export async function syncEmployeesFromOdoo(): Promise<OdooEmployeeSyncSummary> {
  const config = getOdooEnvConfig();
  if (!config.baseUrl || config.authMode === "unconfigured") {
    return {
      ok: false,
      modelUsed: null,
      totalFetched: 0,
      linkedExisting: 0,
      updatedExisting: 0,
      createdNew: 0,
      skipped: 0,
      errors: ["Odoo API is not configured (missing ODOO_API_URL or credentials)."],
    };
  }

  let modelUsed: "hr.employee" | "hr.employee.public" | null = null;
  let rawRecords = [];
  try {
    const fetched = await fetchAllOdooEmployees();
    modelUsed = fetched.modelUsed;
    rawRecords = fetched.records;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("Failed to fetch employees from Odoo", { error: msg });
    return {
      ok: false,
      modelUsed: null,
      totalFetched: 0,
      linkedExisting: 0,
      updatedExisting: 0,
      createdNew: 0,
      skipped: 0,
      errors: [msg],
    };
  }

  // Refresh cached Odoo departments & job titles alongside employee sync
  await syncOdooCatalogFromRecords(rawRecords).catch((err) => {
    log.warn("Failed to refresh Odoo job title/department cache", { error: String(err) });
  });

  const [existingEmployees, existingBranches, boundIdentities] = await Promise.all([
    prisma.employee.findMany({
      select: {
        id: true,
        employeeCode: true,
        odooEmployeeId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        jobTitle: true,
        department: true,
        status: true,
      },
    }),
    prisma.branch.findMany({
      select: { id: true, slug: true, name: true },
    }),
    prisma.employeeDeviceIdentity.findMany({
      where: { providerType: ProviderType.MOBILE_APP, revokedAt: null },
      select: { employeeId: true },
    }),
  ]);

  const boundEmployeeIds = new Set(boundIdentities.map((b) => b.employeeId));

  const candidates: LocalEmployeeCandidate[] = existingEmployees.map((emp) => ({
    id: emp.id,
    odooEmployeeId: emp.odooEmployeeId,
    firstName: emp.firstName,
    lastName: emp.lastName,
    email: emp.email,
    phone: emp.phone,
  }));

  const usedCodes = new Set(existingEmployees.map((e) => e.employeeCode.toUpperCase()));

  const resolveOrCreateBranchId = async (spec: {
    slug: string;
    name: string;
    location: string;
    keyword: string;
  }): Promise<string> => {
    const exact = existingBranches.find((b) => b.slug === spec.slug);
    if (exact) return exact.id;

    const byKeyword = existingBranches.find(
      (b) =>
        normalizeSlugToken(b.name).includes(spec.keyword) ||
        normalizeSlugToken(b.slug).includes(spec.keyword),
    );
    if (byKeyword) return byKeyword.id;

    const created = await prisma.branch.create({
      data: {
        slug: spec.slug,
        name: spec.name,
        location: spec.location,
        isActive: true,
      },
      select: { id: true, slug: true, name: true },
    });
    existingBranches.push(created);
    return created.id;
  };

  let linkedExisting = 0;
  let updatedExisting = 0;
  let createdNew = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const raw of rawRecords) {
    const normalized = normalizeOdooEmployee(raw);
    if (!normalized) {
      skipped++;
      continue;
    }

    try {
      const outcome = matchOdooEmployeeToLocal(normalized, candidates);

      if (outcome.kind === "already_linked") {
        const current = existingEmployees.find((e) => e.id === outcome.localEmployeeId);
        // Device-bound phone authority: if the staff member has an active bound
        // mobile device, their Ops phone is verified and must NOT be overwritten
        // by an outdated Odoo phone; instead push the verified phone back to Odoo.
        const hasBoundPhone =
          Boolean(current?.phone) && boundEmployeeIds.has(outcome.localEmployeeId);
        const effectivePhone = hasBoundPhone
          ? current!.phone
          : (normalized.phone ?? current?.phone ?? null);

        await prisma.employee.update({
          where: { id: outcome.localEmployeeId },
          data: {
            masterSource: MasterSource.ODOO,
            firstName: normalized.firstName,
            lastName: normalized.lastName,
            jobTitle: normalized.jobTitle ?? current?.jobTitle ?? null,
            department: current?.department ?? normalized.department,
            email: normalized.email ?? current?.email ?? null,
            phone: effectivePhone,
            ...(normalized.isActive
              ? {}
              : {
                  status: EmploymentStatus.TERMINATED,
                  terminationDate: new Date(),
                }),
          },
        });

        if (
          hasBoundPhone &&
          current?.phone &&
          normalizePhoneKey(current.phone) !== normalizePhoneKey(normalized.phone)
        ) {
          const trimmedPhone = current.phone.trim();
          await updateOdooEmployee(Number(normalized.odooEmployeeId), {
            mobile_phone: trimmedPhone,
            work_phone: trimmedPhone,
          }).catch((err) => {
            log.warn("Failed to push verified bound phone back to Odoo", {
              employeeId: outcome.localEmployeeId,
              odooEmployeeId: normalized.odooEmployeeId,
              error: String(err),
            });
          });
        }

        updatedExisting++;
      } else if (outcome.kind === "link_existing") {
        const current = existingEmployees.find((e) => e.id === outcome.localEmployeeId);
        const hasBoundPhone =
          Boolean(current?.phone) && boundEmployeeIds.has(outcome.localEmployeeId);
        const effectivePhone = hasBoundPhone
          ? current!.phone
          : (normalized.phone ?? current?.phone ?? null);

        await prisma.employee.update({
          where: { id: outcome.localEmployeeId },
          data: {
            odooEmployeeId: normalized.odooEmployeeId,
            masterSource: MasterSource.ODOO,
            jobTitle: normalized.jobTitle ?? current?.jobTitle ?? null,
            department: current?.department ?? normalized.department,
            email: normalized.email ?? current?.email ?? null,
            phone: effectivePhone,
            ...(normalized.isActive
              ? {}
              : {
                  status: EmploymentStatus.TERMINATED,
                  terminationDate: new Date(),
                }),
          },
        });

        if (
          hasBoundPhone &&
          current?.phone &&
          normalizePhoneKey(current.phone) !== normalizePhoneKey(normalized.phone)
        ) {
          const trimmedPhone = current.phone.trim();
          await updateOdooEmployee(Number(normalized.odooEmployeeId), {
            mobile_phone: trimmedPhone,
            work_phone: trimmedPhone,
          }).catch((err) => {
            log.warn("Failed to push verified bound phone back to Odoo on link", {
              employeeId: outcome.localEmployeeId,
              odooEmployeeId: normalized.odooEmployeeId,
              error: String(err),
            });
          });
        }

        const candidate = candidates.find((c) => c.id === outcome.localEmployeeId);
        if (candidate) {
          candidate.odooEmployeeId = normalized.odooEmployeeId;
        }
        linkedExisting++;
      } else if (outcome.kind === "duplicate_in_odoo") {
        // Record is a duplicate in Odoo (e.g. Batch 2 copy) that shares name/phone/email with an already-linked employee.
        // Skip it so it NEVER spawns a duplicate employee record locally.
        skipped++;
        log.warn("Detected and skipped duplicate record in Odoo", {
          odooId: normalized.odooEmployeeId,
          name: normalized.rawName,
          existingLinkedId: outcome.existingLinkedId,
          matchedBy: outcome.matchedBy,
        });
      } else {
        // Unmatched employee in Odoo: do NOT auto-create in local DB.
        // It is preserved for manual review on the Discrepancies panel.
        skipped++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Odoo employee #${raw.id} (${normalized.rawName}): ${msg}`);
    }
  }

  log.info("Completed Odoo employee sync", {
    modelUsed,
    totalFetched: rawRecords.length,
    linkedExisting,
    updatedExisting,
    createdNew,
    skipped,
    errorCount: errors.length,
  });

  return {
    ok: errors.length === 0,
    modelUsed,
    totalFetched: rawRecords.length,
    linkedExisting,
    updatedExisting,
    createdNew,
    skipped,
    errors,
  };
}

export type SyncAttendanceOptions = {
  /** Specific calendar date ("YYYY-MM-DD") to sync. */
  dateKey?: string;
  /** Number of days back from today to scan when dateKey is omitted. Defaults to 7. */
  lookbackDays?: number;
  /** Specific AttendanceDay IDs to sync/retry. */
  attendanceDayIds?: string[];
  /** Max records per batch. Defaults to 250. */
  limit?: number;
};

/**
 * Syncs completed `AttendanceDay` records to Odoo's `hr.attendance` model.
 *
 * - Sends `check_in` and `check_out` in UTC (`"YYYY-MM-DD HH:MM:SS"`).
 * - Applies the approved-overtime rule:
 *   - Unapproved overtime (`overtimeMinutes > 0`, `payableOvertimeMinutes == 0`) caps `check_out` at `scheduledEnd`.
 *   - Approved/overridden overtime (`payableOvertimeMinutes > 0`) sends the overtime closing time so Odoo
 *     computes the overtime automatically from `check_out - check_in`.
 * - Prevents duplicates by checking Odoo for overlapping records before creating, and updates (`PATCH`)
 *   existing records when overtime is approved after an initial sync.
 */
export async function syncAttendanceToOdoo(
  options: SyncAttendanceOptions = {},
): Promise<OdooAttendanceSyncSummary> {
  const config = getOdooEnvConfig();
  if (!config.baseUrl || config.authMode === "unconfigured") {
    return {
      ok: false,
      examined: 0,
      created: 0,
      updated: 0,
      alreadySynced: 0,
      skipped: 0,
      failed: 0,
      items: [],
    };
  }

  const limit = options.limit ?? 250;
  const lookbackDays = options.lookbackDays ?? 7;

  const todayUtc = new Date();
  const minWorkDate = new Date(todayUtc.getTime() - lookbackDays * 24 * 60 * 60_000);

  const days = await prisma.attendanceDay.findMany({
    where: options.attendanceDayIds?.length
      ? { id: { in: options.attendanceDayIds } }
      : options.dateKey
        ? {
            workDate: new Date(`${options.dateKey}T00:00:00.000Z`),
            actualIn: { not: null },
            actualOut: { not: null },
          }
        : {
            workDate: { gte: minWorkDate },
            actualIn: { not: null },
            actualOut: { not: null },
          },
    orderBy: [{ workDate: "desc" }, { updatedAt: "desc" }],
    take: limit,
  });

  if (days.length === 0) {
    return {
      ok: true,
      examined: 0,
      created: 0,
      updated: 0,
      alreadySynced: 0,
      skipped: 0,
      failed: 0,
      items: [],
    };
  }

  const employeeIds = [...new Set(days.map((d) => d.employeeId))];
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      odooEmployeeId: true,
    },
  });
  const employeeMap = new Map(employees.map((e) => [e.id, e]));

  let created = 0;
  let updated = 0;
  let alreadySynced = 0;
  let skipped = 0;
  let failed = 0;
  const items: OdooAttendanceSyncItemResult[] = [];

  for (const day of days) {
    const emp = employeeMap.get(day.employeeId);
    const employeeName = emp ? `${emp.firstName} ${emp.lastName}` : day.employeeId;
    const workDateStr = day.workDate.toISOString().slice(0, 10);

    if (!emp?.odooEmployeeId) {
      await prisma.attendanceDay.update({
        where: { id: day.id },
        data: {
          odooSyncStatus: OdooSyncStatus.SKIPPED,
          odooSyncError: "Employee does not have an odooEmployeeId linked yet.",
        },
      });
      skipped++;
      items.push({
        attendanceDayId: day.id,
        employeeId: day.employeeId,
        employeeName,
        odooEmployeeId: "",
        workDate: workDateStr,
        action: "skipped",
        error: "Employee does not have an odooEmployeeId linked yet.",
      });
      continue;
    }

    const odooEmpIdNum = Number.parseInt(emp.odooEmployeeId, 10);
    if (!Number.isFinite(odooEmpIdNum) || odooEmpIdNum <= 0) {
      await prisma.attendanceDay.update({
        where: { id: day.id },
        data: {
          odooSyncStatus: OdooSyncStatus.FAILED,
          odooSyncError: `Invalid numeric odooEmployeeId: "${emp.odooEmployeeId}"`,
        },
      });
      failed++;
      items.push({
        attendanceDayId: day.id,
        employeeId: day.employeeId,
        employeeName,
        odooEmployeeId: emp.odooEmployeeId,
        workDate: workDateStr,
        action: "failed",
        error: `Invalid numeric odooEmployeeId: "${emp.odooEmployeeId}"`,
      });
      continue;
    }

    const window = resolveEffectiveOdooAttendanceWindow({
      actualIn: day.actualIn,
      actualOut: day.actualOut,
      scheduledStart: day.scheduledStart,
      scheduledEnd: day.scheduledEnd,
      overtimeMinutes: day.overtimeMinutes,
      payableOvertimeMinutes: day.payableOvertimeMinutes,
    });

    if (!window.ok) {
      await prisma.attendanceDay.update({
        where: { id: day.id },
        data: {
          odooSyncStatus: OdooSyncStatus.SKIPPED,
          odooSyncError: `Skipped: ${window.reason}`,
        },
      });
      skipped++;
      items.push({
        attendanceDayId: day.id,
        employeeId: day.employeeId,
        employeeName,
        odooEmployeeId: emp.odooEmployeeId,
        workDate: workDateStr,
        action: "skipped",
        error: window.reason,
      });
      continue;
    }

    try {
      // Case 1: Already linked to an Odoo attendance record
      if (day.odooAttendanceId) {
        const inUnchanged =
          day.odooSyncedIn &&
          Math.abs(day.odooSyncedIn.getTime() - window.checkIn.getTime()) < 1000;
        const outUnchanged =
          day.odooSyncedOut &&
          Math.abs(day.odooSyncedOut.getTime() - window.checkOut.getTime()) < 1000;

        if (day.odooSyncStatus === OdooSyncStatus.SYNCED && inUnchanged && outUnchanged) {
          alreadySynced++;
          items.push({
            attendanceDayId: day.id,
            employeeId: day.employeeId,
            employeeName,
            odooEmployeeId: emp.odooEmployeeId,
            workDate: workDateStr,
            action: "already_synced",
            odooAttendanceId: day.odooAttendanceId,
            checkInUtc: window.checkInUtc,
            checkOutUtc: window.checkOutUtc,
            cappedAtScheduledEnd: window.cappedAtScheduledEnd,
          });
          continue;
        }

        // Effective check_in / check_out changed (e.g. overtime was approved after initial sync)
        await updateOdooAttendance(day.odooAttendanceId, {
          checkInUtc: window.checkInUtc,
          checkOutUtc: window.checkOutUtc,
        });

        await prisma.attendanceDay.update({
          where: { id: day.id },
          data: {
            odooSyncStatus: OdooSyncStatus.SYNCED,
            odooSyncedAt: new Date(),
            odooSyncedIn: window.checkIn,
            odooSyncedOut: window.checkOut,
            odooSyncError: null,
          },
        });

        updated++;
        items.push({
          attendanceDayId: day.id,
          employeeId: day.employeeId,
          employeeName,
          odooEmployeeId: emp.odooEmployeeId,
          workDate: workDateStr,
          action: "updated",
          odooAttendanceId: day.odooAttendanceId,
          checkInUtc: window.checkInUtc,
          checkOutUtc: window.checkOutUtc,
          cappedAtScheduledEnd: window.cappedAtScheduledEnd,
        });
        continue;
      }

      // Case 2: Not linked yet — check Odoo for overlapping or open records first
      const conflicts = await findConflictingOdooAttendances(
        odooEmpIdNum,
        window.checkInUtc,
        window.checkOutUtc,
      );

      if (conflicts.length === 0) {
        const newOdooId = await createOdooAttendance({
          odooEmployeeId: odooEmpIdNum,
          checkInUtc: window.checkInUtc,
          checkOutUtc: window.checkOutUtc,
        });

        await prisma.attendanceDay.update({
          where: { id: day.id },
          data: {
            odooAttendanceId: newOdooId,
            odooSyncStatus: OdooSyncStatus.SYNCED,
            odooSyncedAt: new Date(),
            odooSyncedIn: window.checkIn,
            odooSyncedOut: window.checkOut,
            odooSyncError: null,
          },
        });

        created++;
        items.push({
          attendanceDayId: day.id,
          employeeId: day.employeeId,
          employeeName,
          odooEmployeeId: emp.odooEmployeeId,
          workDate: workDateStr,
          action: "created",
          odooAttendanceId: newOdooId,
          checkInUtc: window.checkInUtc,
          checkOutUtc: window.checkOutUtc,
          cappedAtScheduledEnd: window.cappedAtScheduledEnd,
        });
      } else if (conflicts.length === 1) {
        const existingOdoo = conflicts[0];
        if (existingOdoo.check_in === window.checkInUtc && existingOdoo.check_out === window.checkOutUtc) {
          // Exact same shift already in Odoo — adopt its ID
          await prisma.attendanceDay.update({
            where: { id: day.id },
            data: {
              odooAttendanceId: existingOdoo.id,
              odooSyncStatus: OdooSyncStatus.SYNCED,
              odooSyncedAt: new Date(),
              odooSyncedIn: window.checkIn,
              odooSyncedOut: window.checkOut,
              odooSyncError: null,
            },
          });

          alreadySynced++;
          items.push({
            attendanceDayId: day.id,
            employeeId: day.employeeId,
            employeeName,
            odooEmployeeId: emp.odooEmployeeId,
            workDate: workDateStr,
            action: "already_synced",
            odooAttendanceId: existingOdoo.id,
            checkInUtc: window.checkInUtc,
            checkOutUtc: window.checkOutUtc,
            cappedAtScheduledEnd: window.cappedAtScheduledEnd,
          });
        } else if (existingOdoo.check_out === false || existingOdoo.check_in === window.checkInUtc) {
          // Open record or same check-in in Odoo — close/update it with our effective check_out
          await updateOdooAttendance(existingOdoo.id, {
            checkOutUtc: window.checkOutUtc,
          });

          await prisma.attendanceDay.update({
            where: { id: day.id },
            data: {
              odooAttendanceId: existingOdoo.id,
              odooSyncStatus: OdooSyncStatus.SYNCED,
              odooSyncedAt: new Date(),
              odooSyncedIn: window.checkIn,
              odooSyncedOut: window.checkOut,
              odooSyncError: null,
            },
          });

          updated++;
          items.push({
            attendanceDayId: day.id,
            employeeId: day.employeeId,
            employeeName,
            odooEmployeeId: emp.odooEmployeeId,
            workDate: workDateStr,
            action: "updated",
            odooAttendanceId: existingOdoo.id,
            checkInUtc: window.checkInUtc,
            checkOutUtc: window.checkOutUtc,
            cappedAtScheduledEnd: window.cappedAtScheduledEnd,
          });
        } else {
          // Odoo already has a completed attendance on that date with different timestamps
          const errMsg = `Rejected: Employee already clocked in/out in Odoo on this date (Odoo #${existingOdoo.id}: ${existingOdoo.check_in} → ${existingOdoo.check_out}).`;
          await prisma.attendanceDay.update({
            where: { id: day.id },
            data: {
              odooSyncStatus: OdooSyncStatus.FAILED,
              odooSyncError: errMsg,
            },
          });
          failed++;
          items.push({
            attendanceDayId: day.id,
            employeeId: day.employeeId,
            employeeName,
            odooEmployeeId: emp.odooEmployeeId,
            workDate: workDateStr,
            action: "failed",
            error: errMsg,
          });
        }
      } else {
        const errMsg = `Rejected: ${conflicts.length} overlapping attendance records already exist in Odoo for this window.`;
        await prisma.attendanceDay.update({
          where: { id: day.id },
          data: {
            odooSyncStatus: OdooSyncStatus.FAILED,
            odooSyncError: errMsg,
          },
        });
        failed++;
        items.push({
          attendanceDayId: day.id,
          employeeId: day.employeeId,
          employeeName,
          odooEmployeeId: emp.odooEmployeeId,
          workDate: workDateStr,
          action: "failed",
          error: errMsg,
        });
      }
    } catch (err) {
      const errMsg =
        err instanceof OdooApiError
          ? `[${err.code}] ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);

      await prisma.attendanceDay.update({
        where: { id: day.id },
        data: {
          odooSyncStatus: OdooSyncStatus.FAILED,
          odooSyncError: errMsg,
        },
      });

      failed++;
      items.push({
        attendanceDayId: day.id,
        employeeId: day.employeeId,
        employeeName,
        odooEmployeeId: emp.odooEmployeeId,
        workDate: workDateStr,
        action: "failed",
        checkInUtc: window.checkInUtc,
        checkOutUtc: window.checkOutUtc,
        error: errMsg,
      });
    }
  }

  log.info("Completed Odoo attendance sync", {
    examined: days.length,
    created,
    updated,
    alreadySynced,
    skipped,
    failed,
  });

  return {
    ok: failed === 0,
    examined: days.length,
    created,
    updated,
    alreadySynced,
    skipped,
    failed,
    items,
  };
}

export type PushEmployeeToOdooResult =
  | { ok: true; action: "created" | "linked_and_updated" | "updated"; odooEmployeeId: string }
  | { ok: false; skipped?: boolean; reason: string };

/**
 * Pushes a single Ops employee to Odoo (create or update) with strict
 * duplicate protection:
 * - If already linked (`odooEmployeeId` set), updates directly by Odoo ID.
 * - If unlinked, requires at least a normalized phone or email and runs
 *   search-before-create against Odoo (trimmed 9-digit phone & lowercased email).
 *   If found, links the existing Odoo ID and updates it; otherwise creates in
 *   Odoo and stores the returned `odooEmployeeId`.
 * - Supports optional `imageBase64` (`image_1920`) for future mobile self-service.
 * - Never throws on Odoo outages so HR operations in Ops stay unblocked.
 */
export async function pushEmployeeToOdoo(
  employeeId: string,
  options?: { imageBase64?: string },
): Promise<PushEmployeeToOdooResult> {
  const config = getOdooEnvConfig();
  if (!config.baseUrl || config.authMode === "unconfigured") {
    return { ok: false, skipped: true, reason: "Odoo API is not configured." };
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      odooEmployeeId: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      jobTitle: true,
      status: true,
    },
  });

  if (!employee) {
    return { ok: false, skipped: true, reason: "Employee not found." };
  }

  const trimmedName = `${employee.firstName.trim()} ${employee.lastName.trim()}`.trim();
  const trimmedPhone = employee.phone?.trim() || null;
  const trimmedEmail = normalizeEmailKey(employee.email);
  const trimmedJobTitle = employee.jobTitle?.trim() || null;

  const writePayload: OdooEmployeeWritePayload = {
    name: trimmedName,
    work_email: trimmedEmail ?? false,
    mobile_phone: trimmedPhone ?? false,
    work_phone: trimmedPhone ?? false,
    job_title: trimmedJobTitle ?? false,
    active: employee.status !== EmploymentStatus.TERMINATED,
    ...(options?.imageBase64 ? { image_1920: options.imageBase64 } : {}),
  };

  try {
    // Case 1: Already linked — update strictly by odooEmployeeId
    if (employee.odooEmployeeId) {
      const numericId = Number(employee.odooEmployeeId);
      if (Number.isInteger(numericId) && numericId > 0) {
        await updateOdooEmployee(numericId, writePayload);
        return { ok: true, action: "updated", odooEmployeeId: employee.odooEmployeeId };
      }
    }

    // Case 2: Unlinked — require normalized phone or email before auto-push
    const phoneKey = normalizePhoneKey(trimmedPhone);
    if (!phoneKey && !trimmedEmail) {
      return {
        ok: false,
        skipped: true,
        reason: "Skipping auto-push to Odoo: employee has neither phone nor email.",
      };
    }

    // Search-before-create in Odoo using strict trimmed/normalized phone & email
    const { records } = await fetchAllOdooEmployees();
    const existingMatch = findOdooEmployeeMatch(
      { phone: trimmedPhone, email: trimmedEmail },
      records,
    );

    if (existingMatch) {
      const matchedOdooId = String(existingMatch.record.id);
      // Guard against linking an Odoo ID already claimed by another local employee
      const claimedByOther = await prisma.employee.findFirst({
        where: { odooEmployeeId: matchedOdooId, NOT: { id: employee.id } },
        select: { id: true },
      });
      if (claimedByOther) {
        log.warn("Odoo match already claimed by another local employee", {
          employeeId: employee.id,
          matchedOdooId,
          claimedBy: claimedByOther.id,
        });
        return {
          ok: false,
          skipped: true,
          reason: `Odoo employee #${matchedOdooId} is already linked to another record.`,
        };
      }

      await prisma.employee.update({
        where: { id: employee.id },
        data: { odooEmployeeId: matchedOdooId },
      });
      await updateOdooEmployee(existingMatch.record.id, writePayload);
      return { ok: true, action: "linked_and_updated", odooEmployeeId: matchedOdooId };
    }

    // Not found in Odoo — create new record and store returned Odoo ID immediately
    const createdOdooId = await createOdooEmployee({
      ...writePayload,
      name: trimmedName,
    });
    const odooIdStr = String(createdOdooId);
    await prisma.employee.update({
      where: { id: employee.id },
      data: { odooEmployeeId: odooIdStr },
    });
    return { ok: true, action: "created", odooEmployeeId: odooIdStr };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn("Non-blocking Odoo employee push failed (will retry in background)", {
      employeeId: employee.id,
      odooEmployeeId: employee.odooEmployeeId,
      error: msg,
    });
    return { ok: false, reason: msg };
  }
}

/**
 * Background catch-up: pushes any active Ops employees created while Odoo was
 * offline (odooEmployeeId is null, has phone or email) via search-before-create.
 */
export async function pushUnlinkedEmployeesToOdoo(limit = 50) {
  const config = getOdooEnvConfig();
  if (!config.baseUrl || config.authMode === "unconfigured") {
    return { attempted: 0, created: 0, linked: 0, skipped: 0, failed: 0 };
  }

  const unlinked = await prisma.employee.findMany({
    where: {
      odooEmployeeId: null,
      status: EmploymentStatus.ACTIVE,
      OR: [{ phone: { not: null } }, { email: { not: null } }],
    },
    select: { id: true },
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  let created = 0;
  let linked = 0;
  let skipped = 0;
  let failed = 0;

  for (const emp of unlinked) {
    const res = await pushEmployeeToOdoo(emp.id);
    if (res.ok) {
      if (res.action === "created") created++;
      else linked++;
    } else if (res.skipped) {
      skipped++;
    } else {
      failed++;
    }
  }

  return { attempted: unlinked.length, created, linked, skipped, failed };
}

/**
 * End-of-day (12:00 AM midnight) cron workflow:
 * 1. Auto-close stale unclosed shifts and settle finished attendance days.
 * 2. Catch up any unlinked active Ops employees to Odoo (search-before-create).
 * 3. Push completed attendance days (with approved overtime closing times) to Odoo.
 */
export async function runNightlyOdooSyncSweep(now: Date = new Date()) {
  const autoClose = await autoCloseStaleDays(now).catch((err) => ({
    error: String(err),
  }));
  const settlement = await runDailySettlementSweep(now).catch((err) => ({
    error: String(err),
  }));
  const unlinkedPush = await pushUnlinkedEmployeesToOdoo().catch((err) => ({
    error: String(err),
  }));
  const attendanceSync = await syncAttendanceToOdoo({ lookbackDays: 7 });

  return {
    timestamp: now.toISOString(),
    autoClose,
    settlement,
    unlinkedPush,
    attendanceSync,
  };
}
