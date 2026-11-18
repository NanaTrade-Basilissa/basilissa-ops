import { PrismaClient, OdooSyncStatus } from "@prisma/client";
import * as dotenv from "dotenv";

dotenv.config();

const PROD_URL =
  process.env.PROD_DATABASE_URL ||
  "postgresql://neondb_owner:npg_4VBlpLw8NtMO@ep-long-wave-av3xbpld-pooler.c-11.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require";
const ODOO_API_URL = process.env.ODOO_API_URL || "https://erp.nanatradeltd.com";
const ODOO_API_KEY = process.env.ODOO_API_KEY || "504bc7865c993914ec48a3ba69c6d9fa9fdb3220";

const prisma = new PrismaClient({
  datasources: { db: { url: PROD_URL } },
});

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatOdooUtcDateTime(date: Date): string {
  const y = date.getUTCFullYear();
  const m = pad2(date.getUTCMonth() + 1);
  const d = pad2(date.getUTCDate());
  const h = pad2(date.getUTCHours());
  const min = pad2(date.getUTCMinutes());
  const s = pad2(date.getUTCSeconds());
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

async function postOdooAttendance(
  odooEmployeeId: number,
  checkInUtc: string,
  checkOutUtc: string,
): Promise<number> {
  const url = `${ODOO_API_URL.replace(/\/+$/, "")}/api/v1/hr.attendance`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-API-Key": ODOO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      employee_id: odooEmployeeId,
      check_in: checkInUtc,
      check_out: checkOutUtc,
      in_mode: "manual",
      out_mode: "manual",
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.id) {
    const errorMsg = data?.error?.message || data?.message || JSON.stringify(data);
    throw new Error(`Odoo API HTTP ${res.status}: ${errorMsg}`);
  }
  return data.id as number;
}

async function main() {
  console.log("============================================================");
  console.log("       STARTING FULL ATTENDANCE RESYNC TO ODOO             ");
  console.log("============================================================");

  // Step 1: Invalidate records whose Odoo IDs were deleted (< 315)
  console.log("[*] Checking for previously synced records with deleted Odoo IDs (< 315)...");
  const resetResult = await prisma.attendanceDay.updateMany({
    where: {
      odooAttendanceId: { not: null, lt: 315 },
    },
    data: {
      odooAttendanceId: null,
      odooSyncStatus: OdooSyncStatus.PENDING,
      odooSyncError: null,
    },
  });
  console.log(`[+] Reset ${resetResult.count} records with deleted Odoo IDs back to PENDING.`);

  // Step 2: Fetch all completed attendance days that need syncing
  const days = await prisma.attendanceDay.findMany({
    where: {
      actualIn: { not: null },
      actualOut: { not: null },
      odooSyncStatus: { in: [OdooSyncStatus.PENDING, OdooSyncStatus.FAILED] },
    },
    orderBy: [{ workDate: "asc" }, { actualIn: "asc" }],
  });
  console.log(`[*] Found ${days.length} completed attendance days pending sync.`);

  // Step 3: Fetch all employees
  const employeeIds = [...new Set(days.map((d) => d.employeeId))];
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds } },
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      odooEmployeeId: true,
    },
  });
  const employeeMap = new Map(employees.map((e) => [e.id, e]));

  let syncedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  const total = days.length;
  console.log(`[*] Beginning upload of ${total} records to Odoo...`);

  // Concurrency worker queue
  const CONCURRENCY = 3;
  let index = 0;

  async function worker() {
    while (index < total) {
      const i = index++;
      const day = days[i];
      const emp = employeeMap.get(day.employeeId);
      const empCode = emp?.employeeCode || day.employeeId;
      const empName = emp ? `${emp.firstName} ${emp.lastName}` : "Unknown";

      if (!emp?.odooEmployeeId) {
        skippedCount++;
        await prisma.attendanceDay.update({
          where: { id: day.id },
          data: {
            odooSyncStatus: OdooSyncStatus.SKIPPED,
            odooSyncError: "Employee does not have an odooEmployeeId linked.",
          },
        });
        continue;
      }

      const odooEmpIdNum = parseInt(emp.odooEmployeeId, 10);
      if (!Number.isFinite(odooEmpIdNum) || odooEmpIdNum <= 0) {
        skippedCount++;
        await prisma.attendanceDay.update({
          where: { id: day.id },
          data: {
            odooSyncStatus: OdooSyncStatus.SKIPPED,
            odooSyncError: `Invalid numeric odooEmployeeId: "${emp.odooEmployeeId}"`,
          },
        });
        continue;
      }

      // Resolve effective window
      const checkIn = day.actualIn!;
      let checkOut = day.actualOut!;

      // Handle overtime policy
      const overtimeMinutes = day.overtimeMinutes ?? 0;
      const payableOvertimeMinutes = day.payableOvertimeMinutes ?? 0;
      const scheduledEnd = day.scheduledEnd;

      if (payableOvertimeMinutes > 0) {
        if (scheduledEnd) {
          if (overtimeMinutes > 0 && payableOvertimeMinutes === overtimeMinutes) {
            checkOut = day.actualOut!;
          } else {
            checkOut = new Date(scheduledEnd.getTime() + payableOvertimeMinutes * 60_000);
          }
        } else {
          checkOut = day.actualOut!;
        }
      } else if (scheduledEnd && day.actualOut!.getTime() > scheduledEnd.getTime() && overtimeMinutes > 0) {
        checkOut = scheduledEnd;
      }

      if (checkOut.getTime() <= checkIn.getTime()) {
        skippedCount++;
        await prisma.attendanceDay.update({
          where: { id: day.id },
          data: {
            odooSyncStatus: OdooSyncStatus.SKIPPED,
            odooSyncError: "CHECK_OUT_NOT_AFTER_CHECK_IN",
          },
        });
        continue;
      }

      const checkInUtc = formatOdooUtcDateTime(checkIn);
      const checkOutUtc = formatOdooUtcDateTime(checkOut);

      try {
        const newOdooAttendanceId = await postOdooAttendance(
          odooEmpIdNum,
          checkInUtc,
          checkOutUtc,
        );

        await prisma.attendanceDay.update({
          where: { id: day.id },
          data: {
            odooAttendanceId: newOdooAttendanceId,
            odooSyncStatus: OdooSyncStatus.SYNCED,
            odooSyncedAt: new Date(),
            odooSyncedIn: checkIn,
            odooSyncedOut: checkOut,
            odooSyncError: null,
          },
        });

        syncedCount++;
      } catch (err: any) {
        failedCount++;
        console.error(
          `[-] FAILED [${i + 1}/${total}] ${empCode} (${empName}): ${err.message}`,
        );
        await prisma.attendanceDay.update({
          where: { id: day.id },
          data: {
            odooSyncStatus: OdooSyncStatus.FAILED,
            odooSyncError: err.message,
          },
        });
      }

      if ((i + 1) % 25 === 0 || i + 1 === total) {
        console.log(
          `[PROGRESS] ${i + 1}/${total} processed | Synced: ${syncedCount} | Skipped: ${skippedCount} | Failed: ${failedCount}`,
        );
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  console.log("============================================================");
  console.log("                 RESYNC COMPLETED SUMMARY                   ");
  console.log("============================================================");
  console.log(`Total Examined:  ${total}`);
  console.log(`Successfully Synced: ${syncedCount}`);
  console.log(`Skipped:         ${skippedCount}`);
  console.log(`Failed:          ${failedCount}`);
  console.log("============================================================");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
