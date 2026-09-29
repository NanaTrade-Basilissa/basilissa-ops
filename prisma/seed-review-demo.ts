/**
 * Creates the dedicated app-store review demo employee (Google Play / Apple
 * reviewers sign in as this account; see lib/modules/attendance/review-demo.ts).
 *
 *   REVIEW_DEMO_PHONE=+233000000001 REVIEW_DEMO_OTP=123456 pnpm db:seed:review-demo
 *
 * Safe to run repeatedly and against production: it only ever touches its own
 * branch, employee, branch assignment and shift, all keyed on fixed slugs and
 * codes. It creates no other data.
 *
 * The demo branch is inactive, with no coordinates and the geofence off, so the
 * reviewer can clock in from anywhere and the branch never shows in the public
 * feedback form. The demo phone is not a real number, so no SMS could ever go
 * to it.
 */
import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { getReviewDemoConfig } from "../lib/modules/attendance/review-demo";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

const BRANCH_SLUG = "app-review-demo";
const EMPLOYEE_CODE = "APPREVIEW";
const SHIFT_NAME = "App review demo (all day)";

async function main() {
  const config = getReviewDemoConfig();
  if (!config) {
    throw new Error(
      "Set REVIEW_DEMO_PHONE (e.g. +233000000001) and REVIEW_DEMO_OTP (exactly 6 digits) first.",
    );
  }

  const clash = await prisma.employee.findFirst({
    where: { phone: config.phone, NOT: { employeeCode: EMPLOYEE_CODE } },
    select: { employeeCode: true },
  });
  if (clash) {
    throw new Error(
      `REVIEW_DEMO_PHONE ${config.phone} already belongs to employee ${clash.employeeCode}. Use a number no real employee has.`,
    );
  }

  const branch = await prisma.branch.upsert({
    where: { slug: BRANCH_SLUG },
    update: { isActive: false, geofenceEnabled: false },
    create: {
      name: "App Review Demo",
      slug: BRANCH_SLUG,
      location: "Demo branch for app store review",
      isActive: false,
      latitude: null,
      longitude: null,
      geofenceEnabled: false,
    },
  });

  const employee = await prisma.employee.upsert({
    where: { employeeCode: EMPLOYEE_CODE },
    update: { phone: config.phone, status: "ACTIVE" },
    create: {
      employeeCode: EMPLOYEE_CODE,
      firstName: "Demo",
      lastName: "Reviewer",
      jobTitle: "App store reviewer",
      phone: config.phone,
      status: "ACTIVE",
    },
  });

  const assignment = await prisma.employeeBranchAssignment.findFirst({
    where: { employeeId: employee.id, branchId: branch.id, validTo: null },
    select: { id: true },
  });
  if (!assignment) {
    await prisma.employeeBranchAssignment.create({
      data: { employeeId: employee.id, branchId: branch.id, isPrimary: true },
    });
  }

  // A shift covering every day, so the app shows a scheduled shift whenever
  // the reviewer opens it.
  let shift = await prisma.shift.findFirst({
    where: { name: SHIFT_NAME, branchId: branch.id },
    select: { id: true },
  });
  if (!shift) {
    shift = await prisma.shift.create({
      data: { name: SHIFT_NAME, branchId: branch.id, startMinute: 0, endMinute: 1439 },
      select: { id: true },
    });
  }

  const shiftAssignment = await prisma.employeeShiftAssignment.findFirst({
    where: { employeeId: employee.id, shiftId: shift.id, validTo: null },
    select: { id: true },
  });
  if (!shiftAssignment) {
    await prisma.employeeShiftAssignment.create({
      data: {
        employeeId: employee.id,
        shiftId: shift.id,
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        validFrom: new Date("2020-01-01T00:00:00.000Z"),
      },
    });
  }

  console.log(`Review demo ready: employee ${EMPLOYEE_CODE}, phone ${config.phone}, branch ${BRANCH_SLUG}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
