/**
 * Applies the Dawhenya pilot rota (PILOT_WEEK) to the resolved employees.
 * Run pilot-shift-templates.ts first.
 *
 *   tsx prisma/pilot-dawhenya-rota.ts           # dry run
 *   tsx prisma/pilot-dawhenya-rota.ts --apply
 *
 * Shape, matching "Generate week": one override per person per day, a
 * SHIFT_CHANGE for a working day and a DAY_OFF for a day off. Overrides beat
 * every recurring schedule, including the open-ended 8-5 default, so a day
 * off can never fall through to 8-5. A day that already has an override
 * (approved leave, a cover shift, a manager's edit) is kept and reported.
 *
 * Before that it makes everyone schedulable: a PILOT_PLACEHOLDERS record is
 * created if missing, and anyone without a current Dawhenya assignment gets a
 * non-primary one from the Monday, keeping their existing branch. A dry run
 * reports both without writing.
 *
 * A `null` day in the rota writes nothing, neither a shift nor a day off.
 *
 * Safe to re-run: every day written becomes an existing override, which the
 * next run keeps.
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

  // Local midnight of the Monday: when a new Dawhenya branch assignment starts.
  const validFrom = zonedMinutesToUtc(PILOT_WEEK.from, 0, branch.timezone);

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
    const days = row.week.map((day, index) => ({ day, dateKey: shiftDateKey(PILOT_WEEK.from, index) }));
    const open = days.filter((d) => d.day === null).map((d) => d.dateKey);
    if (open.length > 0) console.log(`${label}  open     ${open.join(", ")} (not decided, nothing written)`);

    const summary = days.map((d) => (d.day === null ? "." : d.day === "OFF" ? "-" : d.day.charAt(0))).join("");

    // A placeholder not created in a dry run has no rows to check against.
    if (!apply && employee.id.startsWith("(new ")) {
      console.log(`${label}  week     ${summary}`);
      for (const d of days) if (d.day === "OFF") totals.daysOff++; else if (d.day) totals.assignments++;
      continue;
    }

    const kept: string[] = [];
    await prisma.$transaction(async (tx) => {
      for (const { day, dateKey } of days) {
        if (day === null) continue;
        // Same date encoding as the override action: the calendar date at UTC midnight.
        const date = new Date(`${dateKey}T00:00:00.000Z`);
        const existing = await tx.scheduleException.findUnique({
          where: { employeeId_date: { employeeId: employee.id, date } },
        });
        // Someone's own change for that day (leave, a cover, an edit) wins.
        if (existing) {
          kept.push(`${dateKey} ${existing.type}`);
          totals.skipped++;
          continue;
        }

        const data =
          day === "OFF"
            ? { type: ScheduleExceptionType.DAY_OFF, shiftId: null, reason: row.offReason ?? REASON }
            : { type: ScheduleExceptionType.SHIFT_CHANGE, shiftId: shiftIds[day], reason: REASON };
        if (day === "OFF") totals.daysOff++;
        else totals.assignments++;
        if (!apply) continue;

        const override = await tx.scheduleException.create({ data: { employeeId: employee.id, date, ...data } });
        await tx.auditLog.create({
          data: {
            ...SYSTEM,
            action: "schedule.override_created",
            entityType: "ScheduleException",
            entityId: override.id,
            after: { ...data, employeeId: employee.id, date: dateKey },
            metadata: { source: SOURCE },
          },
        });
      }
    }, { timeout: 60_000 });
    console.log(`${label}  week     ${summary}${kept.length ? `   kept existing: ${kept.join(", ")}` : ""}`);
  }

  console.log(
    `\n${apply ? "Wrote" : "Would write"} ${totals.created} placeholder(s), ${totals.branched} Dawhenya branch assignment(s), ` +
      `${totals.assignments} shift day(s), ${totals.daysOff} day(s) off; kept ${totals.skipped} existing.`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
