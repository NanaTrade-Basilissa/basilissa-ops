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
 * Before that it makes everyone schedulable: a PILOT_PLACEHOLDERS record is
 * created if missing, and anyone without a current Dawhenya assignment gets a
 * non-primary one from the Monday, keeping their existing branch. A dry run
 * reports both without writing.
 *
 * A `null` day in the rota writes nothing, neither a shift nor a day off.
 *
 * Safe to re-run: an identical assignment or an existing exception on the same
 * date is skipped and reported.
 */
import { PrismaClient, ScheduleExceptionType } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { shiftDateKey, zonedMinutesToUtc } from "../lib/platform/date";
import {
  PILOT_BRANCH_SLUG,
  PILOT_PLACEHOLDERS,
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

  const totals = { created: 0, branched: 0, assignments: 0, daysOff: 0, skipped: 0 };

  // Resolve everyone before writing anything, so one bad row aborts the run.
  // A placeholder that does not exist yet resolves to a stand-in in a dry run.
  const placeholders = new Map(PILOT_PLACEHOLDERS.map((p) => [p.employeeCode, p]));
  const resolved = [];
  for (const row of PILOT_ROTA) {
    const employee = await prisma.employee.findUnique({
      where: { employeeCode: row.employeeCode },
      include: { branchAssignments: { where: { validTo: null }, include: { branch: { select: { name: true } } } } },
    });
    const placeholder = placeholders.get(row.employeeCode);
    if (!employee && !placeholder) throw new Error(`${row.rotaName}: no employee ${row.employeeCode}.`);
    if (employee) {
      if (!employee.firstName.toUpperCase().includes(row.expectFirstName)) {
        throw new Error(`${row.rotaName}: ${row.employeeCode} is ${employee.firstName} ${employee.lastName}.`);
      }
      if (employee.status !== "ACTIVE") throw new Error(`${row.rotaName}: ${row.employeeCode} is ${employee.status}.`);
    }
    resolved.push({ row, employee, placeholder });
  }

  const ready: { row: (typeof PILOT_ROTA)[number]; employee: { id: string; employeeCode: string } }[] = [];
  for (const { row, employee, placeholder } of resolved) {
    const label = `${row.rotaName.padEnd(24)} ${row.employeeCode}`;

    if (!employee) {
      console.log(`${label}  create   placeholder ${placeholder!.firstName} ${placeholder!.lastName}, at ${branch.name}`);
      totals.created++;
      if (!apply) {
        ready.push({ row, employee: { id: `(new ${row.employeeCode})`, employeeCode: row.employeeCode } });
        continue;
      }
      const created = await prisma.$transaction(async (tx) => {
        const e = await tx.employee.create({
          data: { employeeCode: placeholder!.employeeCode, firstName: placeholder!.firstName, lastName: placeholder!.lastName, jobTitle: placeholder!.jobTitle, status: "ACTIVE" },
        });
        await tx.auditLog.create({
          data: { ...SYSTEM, action: "employee.created", entityType: "Employee", entityId: e.id, after: { employeeCode: e.employeeCode, firstName: e.firstName, lastName: e.lastName, jobTitle: e.jobTitle }, metadata: { source: SOURCE, placeholder: true } },
        });
        const a = await tx.employeeBranchAssignment.create({
          data: { employeeId: e.id, branchId: branch.id, isPrimary: true, validFrom },
        });
        await tx.auditLog.create({
          data: { ...SYSTEM, action: "employee.branch_assigned", entityType: "Employee", entityId: e.id, after: { branchId: branch.id, isPrimary: true, validFrom: validFrom.toISOString(), assignmentId: a.id }, metadata: { source: SOURCE } },
        });
        return e;
      });
      ready.push({ row, employee: created });
      continue;
    }

    const atBranch = employee.branchAssignments.some((a) => a.branchId === branch.id);
    if (!atBranch) {
      const current = employee.branchAssignments.map((a) => a.branch.name).join(", ") || "no branch";
      console.log(`${label}  branch   add ${branch.name} (keeps ${current})`);
      totals.branched++;
      if (apply) {
        await prisma.$transaction(async (tx) => {
          const a = await tx.employeeBranchAssignment.create({
            data: { employeeId: employee.id, branchId: branch.id, isPrimary: false, validFrom },
          });
          await tx.auditLog.create({
            data: { ...SYSTEM, action: "employee.branch_assigned", entityType: "Employee", entityId: employee.id, after: { branchId: branch.id, isPrimary: false, validFrom: validFrom.toISOString(), assignmentId: a.id }, metadata: { source: SOURCE } },
          });
        });
      }
    }
    ready.push({ row, employee });
  }

  for (const { row, employee } of ready) {
    const label = `${row.rotaName.padEnd(24)} ${employee.employeeCode}`;

    // ISO weekday (1 = Monday) per template.
    const byShift = new Map<PilotShiftKey, number[]>();
    const offDates: string[] = [];
    const openDates: string[] = [];
    row.week.forEach((day, index) => {
      if (day === null) openDates.push(shiftDateKey(PILOT_WEEK.from, index));
      else if (day === "OFF") offDates.push(shiftDateKey(PILOT_WEEK.from, index));
      else byShift.set(day, [...(byShift.get(day) ?? []), index + 1]);
    });

    if (openDates.length > 0) console.log(`${label}  open     ${openDates.join(", ")} (not decided, nothing written)`);

    // A placeholder not created in a dry run has no rows to check against.
    if (!apply && employee.id.startsWith("(new ")) {
      for (const [key, daysOfWeek] of byShift) {
        console.log(`${label}  assign   ${key} days ${daysOfWeek.join(",")}`);
        totals.assignments++;
      }
      for (const dateKey of offDates) {
        console.log(`${label}  day off  ${dateKey}`);
        totals.daysOff++;
      }
      continue;
    }

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
    `\n${apply ? "Wrote" : "Would write"} ${totals.created} placeholder(s), ${totals.branched} Dawhenya branch assignment(s), ` +
      `${totals.assignments} shift assignment(s), ${totals.daysOff} day(s) off; skipped ${totals.skipped}.`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
