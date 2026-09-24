/**
 * Applies the Dawhenya pilot rota (PILOT_WEEK) to the resolved employees.
 * Run pilot-shift-templates.ts first.
 *
 *   tsx prisma/pilot-dawhenya-rota.ts           # dry run
 *   tsx prisma/pilot-dawhenya-rota.ts --apply
 *
 * Shape, matching bulkAssignShiftAction: one assignment per employee per
 * template, bounded to the week. Existing open-ended assignments are left
 * alone; the resolver prefers the most recent validFrom, so the week's
 * assignments win while they apply.
 *
 * That is also why days off are DAY_OFF exceptions, not just gaps: a gap would
 * fall through to the employee's older assignment for that weekday.
 *
 * Safe to re-run: an identical assignment or an existing exception on the same
 * date is skipped and reported.
 */
import { PrismaClient, ScheduleExceptionType } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { shiftDateKey, zonedMinutesToUtc } from "../lib/platform/date";
import {
  PILOT_BRANCH_SLUG,
  PILOT_ROTA,
  PILOT_SHIFT_TEMPLATES,
  PILOT_WEEK,
  assertSafeDatabase,
  isApply,
  type PilotShiftKey,
} from "./pilot-data";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();
const SYSTEM = { actorUserId: null, actorEmail: null, actorRole: "SYSTEM" };
const SOURCE = "prisma/pilot-dawhenya-rota.ts";
const REASON = `Dawhenya pilot rota ${PILOT_WEEK.from} to ${PILOT_WEEK.to}`;

async function main() {
  assertSafeDatabase();
  const apply = isApply();

  const branch = await prisma.branch.findUnique({ where: { slug: PILOT_BRANCH_SLUG } });
  if (!branch) throw new Error(`No branch with slug ${PILOT_BRANCH_SLUG}.`);

  // Local midnight of the Monday, to local midnight after the Sunday. The
  // resolver treats validTo as exclusive.
  const validFrom = zonedMinutesToUtc(PILOT_WEEK.from, 0, branch.timezone);
  const validTo = zonedMinutesToUtc(shiftDateKey(PILOT_WEEK.to, 1), 0, branch.timezone);

  const shiftIds = {} as Record<PilotShiftKey, string>;
  for (const [key, template] of Object.entries(PILOT_SHIFT_TEMPLATES) as [PilotShiftKey, (typeof PILOT_SHIFT_TEMPLATES)[PilotShiftKey]][]) {
    const shift = await prisma.shift.findFirst({ where: { name: template.name, branchId: null, isActive: true } });
    if (!shift) throw new Error(`Template "${template.name}" not found. Run pilot-shift-templates.ts --apply first.`);
    shiftIds[key] = shift.id;
  }

  // Resolve everyone before writing anything, so one bad row aborts the run.
  const resolved = [];
  for (const row of PILOT_ROTA) {
    const employee = await prisma.employee.findUnique({
      where: { employeeCode: row.employeeCode },
      include: { branchAssignments: { where: { branchId: branch.id, validTo: null } } },
    });
    if (!employee) throw new Error(`${row.rotaName}: no employee ${row.employeeCode}.`);
    if (!employee.firstName.toUpperCase().includes(row.expectFirstName)) {
      throw new Error(`${row.rotaName}: ${row.employeeCode} is ${employee.firstName} ${employee.lastName}.`);
    }
    if (employee.status !== "ACTIVE") throw new Error(`${row.rotaName}: ${row.employeeCode} is ${employee.status}.`);
    if (employee.branchAssignments.length === 0) {
      throw new Error(`${row.rotaName}: ${row.employeeCode} is not currently assigned to ${branch.name}.`);
    }
    resolved.push({ row, employee });
  }

  const totals = { assignments: 0, daysOff: 0, skipped: 0 };

  for (const { row, employee } of resolved) {
    const label = `${row.rotaName.padEnd(22)} ${employee.employeeCode}`;

    // ISO weekday (1 = Monday) per template.
    const byShift = new Map<PilotShiftKey, number[]>();
    const offDates: string[] = [];
    row.week.forEach((day, index) => {
      if (day === "OFF") offDates.push(shiftDateKey(PILOT_WEEK.from, index));
      else byShift.set(day, [...(byShift.get(day) ?? []), index + 1]);
    });

    await prisma.$transaction(async (tx) => {
      for (const [key, daysOfWeek] of byShift) {
        const shiftId = shiftIds[key];
        const existing = await tx.employeeShiftAssignment.findFirst({
          where: { employeeId: employee.id, shiftId, validFrom, validTo },
        });
        if (existing) {
          console.log(`${label}  skip     ${key} ${daysOfWeek.join(",")} (already assigned)`);
          totals.skipped++;
          continue;
        }
        console.log(`${label}  assign   ${key} days ${daysOfWeek.join(",")}`);
        totals.assignments++;
        if (!apply) continue;

        await tx.employeeShiftAssignment.create({
          data: { employeeId: employee.id, shiftId, daysOfWeek, validFrom, validTo },
        });
        await tx.auditLog.create({
          data: {
            ...SYSTEM,
            action: "employee.shift_assigned",
            entityType: "Employee",
            entityId: employee.id,
            after: { shiftId, daysOfWeek, validFrom: validFrom.toISOString(), validTo: validTo.toISOString() },
            metadata: { source: SOURCE },
          },
        });
      }

      for (const dateKey of offDates) {
        // Same date encoding as the override action: the calendar date at UTC midnight.
        const date = new Date(`${dateKey}T00:00:00.000Z`);
        const existing = await tx.scheduleException.findUnique({
          where: { employeeId_date: { employeeId: employee.id, date } },
        });
        if (existing) {
          console.log(`${label}  skip     OFF ${dateKey} (exception exists: ${existing.type})`);
          totals.skipped++;
          continue;
        }
        console.log(`${label}  day off  ${dateKey}`);
        totals.daysOff++;
        if (!apply) continue;

        const override = await tx.scheduleException.create({
          data: { employeeId: employee.id, date, type: ScheduleExceptionType.DAY_OFF, reason: REASON },
        });
        await tx.auditLog.create({
          data: {
            ...SYSTEM,
            action: "schedule.override_created",
            entityType: "ScheduleException",
            entityId: override.id,
            after: { type: ScheduleExceptionType.DAY_OFF, shiftId: null, reason: REASON, employeeId: employee.id, date: dateKey },
            metadata: { source: SOURCE },
          },
        });
      }
    });
  }

  console.log(
    `\n${apply ? "Wrote" : "Would write"} ${totals.assignments} assignment(s), ${totals.daysOff} day(s) off; skipped ${totals.skipped}.`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
