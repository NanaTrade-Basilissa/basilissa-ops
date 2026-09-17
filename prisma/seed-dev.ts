import {
  PrismaClient,
  Role,
  ScopeType,
  DayStatus,
  LeaveType,
  LeaveStatus,
  AttendanceDirection,
  ProviderType,
  IdentityAssurance,
  LocationAssurance,
  TimeAssurance,
  VerificationOutcome,
  GeofenceDecision,
  AssessmentStatus,
  AssessmentQuestionKind,
  AptitudeTestStatus,
  AptitudeQuestionKind,
  Prisma,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { FEEDBACK_QUESTIONS } from "../lib/modules/feedback/constants";
import { SAMPLE_BRANCHES } from "./seed-data";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

const COMMON_PASSWORD = "Password123!";

function makeTokenHash(plain: string): string {
  return crypto.createHash("sha256").update(plain).digest("hex");
}

function subDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function seedBaseQuestionsAndBranches() {
  console.log("Seeding base feedback questions and branches...");
  for (const q of FEEDBACK_QUESTIONS) {
    await prisma.question.upsert({
      where: { order: q.order },
      update: { text: q.text, isActive: true },
      create: { ...q, isActive: true },
    });
  }

  for (const b of SAMPLE_BRANCHES) {
    await prisma.branch.upsert({
      where: { slug: b.slug },
      update: { name: b.name, location: b.location, isActive: true },
      create: { ...b, isActive: true, timezone: "Africa/Accra" },
    });
  }
}

async function seedUsersAndRoles() {
  console.log("Seeding dev users and role assignments...");
  const passwordHash = await bcrypt.hash(COMMON_PASSWORD, 10);
  const now = new Date();

  async function ensureUser(email: string, name: string) {
    return prisma.user.upsert({
      where: { email },
      update: { name, status: "ACTIVE" },
      create: {
        email,
        name,
        passwordHash,
        status: "ACTIVE",
        passwordChangedAt: now,
      },
    });
  }

  async function grantRole(userId: string, role: Role, scopeType: ScopeType, scopeId: string = "") {
    await prisma.roleAssignment.upsert({
      where: {
        userId_role_scopeType_scopeId: {
          userId,
          role,
          scopeType,
          scopeId,
        },
      },
      update: { validTo: null },
      create: {
        userId,
        role,
        scopeType,
        scopeId,
        validFrom: now,
      },
    });
  }

  const superAdmin = await ensureUser("admin@basilissagh.com", "Super Administrator");
  await grantRole(superAdmin.id, Role.SUPER_ADMIN, ScopeType.GLOBAL, "");

  const administrator = await ensureUser("administrator@basilissagh.com", "Operations Admin");
  await grantRole(administrator.id, Role.ADMINISTRATOR, ScopeType.GLOBAL, "");

  const hrUser = await ensureUser("hr@basilissagh.com", "HR Director");
  await grantRole(hrUser.id, Role.HR, ScopeType.GLOBAL, "");

  const branches = await prisma.branch.findMany({ where: { isActive: true } });
  const accraSlugs = ["accra-mall", "achimota-mall", "west-hills-mall"];
  const temaSlugs = ["community-25-dawhenya", "tema-community-6"];

  const areaAccra = await ensureUser("area.accra@basilissagh.com", "Area Manager Accra");
  for (const slug of accraSlugs) {
    const b = branches.find((x) => x.slug === slug);
    if (b) {
      await grantRole(areaAccra.id, Role.AREA_MANAGER, ScopeType.BRANCH, b.id);
    }
  }

  const areaTema = await ensureUser("area.tema@basilissagh.com", "Area Manager Tema");
  for (const slug of temaSlugs) {
    const b = branches.find((x) => x.slug === slug);
    if (b) {
      await grantRole(areaTema.id, Role.AREA_MANAGER, ScopeType.BRANCH, b.id);
    }
  }

  const branchManagers: Record<string, { id: string; email: string; name: string }> = {};
  for (const branch of branches) {
    const cleanSlug = branch.slug.replace(/[^a-zA-Z0-9]/g, "");
    const email = `manager.${cleanSlug}@basilissagh.com`;
    const name = `${branch.name} Manager`;
    const bmUser = await ensureUser(email, name);
    await grantRole(bmUser.id, Role.BRANCH_MANAGER, ScopeType.BRANCH, branch.id);
    branchManagers[branch.id] = bmUser;
  }

  const accraBranch = branches.find((x) => x.slug === "accra-mall") || branches[0];
  const temaBranch = branches.find((x) => x.slug === "tema-community-6") || branches[1];

  if (accraBranch) {
    const supAccra = await ensureUser("supervisor.accra@basilissagh.com", "Supervisor Accra Mall");
    await grantRole(supAccra.id, Role.SHIFT_SUPERVISOR, ScopeType.BRANCH, accraBranch.id);
  }

  if (temaBranch) {
    const supTema = await ensureUser("supervisor.tema@basilissagh.com", "Supervisor Tema");
    await grantRole(supTema.id, Role.SHIFT_SUPERVISOR, ScopeType.BRANCH, temaBranch.id);
  }

  const employeesWithoutUser = await prisma.employee.findMany({
    where: { userId: null, status: "ACTIVE" },
    take: 10,
  });

  for (const emp of employeesWithoutUser) {
    const email = emp.email || `staff.${emp.employeeCode.toLowerCase()}@basilissagh.com`;
    const user = await ensureUser(email, `${emp.firstName} ${emp.lastName}`);
    await prisma.employee.update({
      where: { id: emp.id },
      data: { userId: user.id },
    });
    await grantRole(user.id, Role.EMPLOYEE, ScopeType.GLOBAL, "");
  }

  return { hrUser, areaAccra, areaTema, branchManagers };
}

async function seedBranchFeedbackRecipients(
  branchManagers: Record<string, { id: string; email: string; name: string }>,
  hrUser: { id: string; email: string; name: string },
  areaAccra: { id: string; email: string; name: string },
  areaTema: { id: string; email: string; name: string },
) {
  console.log("Seeding branch feedback recipients...");
  const branches = await prisma.branch.findMany({ where: { isActive: true } });
  const accraSlugs = new Set(["accra-mall", "achimota-mall", "west-hills-mall"]);

  for (const branch of branches) {
    const bm = branchManagers[branch.id];
    if (bm) {
      await prisma.branchFeedbackRecipient.upsert({
        where: { branchId_email: { branchId: branch.id, email: bm.email } },
        update: { enabled: true, name: bm.name, roleLabel: "Branch Manager", userId: bm.id },
        create: {
          branchId: branch.id,
          email: bm.email,
          name: bm.name,
          roleLabel: "Branch Manager",
          userId: bm.id,
          enabled: true,
        },
      });
    }

    const areaMgr = accraSlugs.has(branch.slug) ? areaAccra : areaTema;
    await prisma.branchFeedbackRecipient.upsert({
      where: { branchId_email: { branchId: branch.id, email: areaMgr.email } },
      update: { enabled: true, name: areaMgr.name, roleLabel: "Area Manager", userId: areaMgr.id },
      create: {
        branchId: branch.id,
        email: areaMgr.email,
        name: areaMgr.name,
        roleLabel: "Area Manager",
        userId: areaMgr.id,
        enabled: true,
      },
    });

    await prisma.branchFeedbackRecipient.upsert({
      where: { branchId_email: { branchId: branch.id, email: hrUser.email } },
      update: { enabled: true, name: hrUser.name, roleLabel: "HR Operations", userId: hrUser.id },
      create: {
        branchId: branch.id,
        email: hrUser.email,
        name: hrUser.name,
        roleLabel: "HR Operations",
        userId: hrUser.id,
        enabled: true,
      },
    });
  }
}

async function seedShiftsAndRotas() {
  console.log("Seeding standard shifts and employee schedules...");
  const morning = await prisma.shift.upsert({
    where: { id: "dev_shift_morning" },
    update: {},
    create: {
      id: "dev_shift_morning",
      name: "Morning Shift (07:00 - 15:30)",
      startMinute: 420,
      endMinute: 930,
      unpaidBreakMinutes: 30,
      isActive: true,
    },
  });

  const afternoon = await prisma.shift.upsert({
    where: { id: "dev_shift_afternoon" },
    update: {},
    create: {
      id: "dev_shift_afternoon",
      name: "Afternoon Shift (14:30 - 23:00)",
      startMinute: 870,
      endMinute: 1380,
      unpaidBreakMinutes: 30,
      isActive: true,
    },
  });

  const night = await prisma.shift.upsert({
    where: { id: "dev_shift_night" },
    update: {},
    create: {
      id: "dev_shift_night",
      name: "Night Shift (22:30 - 07:00)",
      startMinute: 1350,
      endMinute: 420,
      unpaidBreakMinutes: 30,
      isActive: true,
    },
  });

  const weekend = await prisma.shift.upsert({
    where: { id: "dev_shift_weekend" },
    update: {},
    create: {
      id: "dev_shift_weekend",
      name: "Weekend Peak (10:00 - 19:00)",
      startMinute: 600,
      endMinute: 1140,
      unpaidBreakMinutes: 60,
      isActive: true,
    },
  });

  const shifts = [morning, afternoon, night, weekend];

  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    take: 120,
    orderBy: { createdAt: "asc" },
  });

  const rotaStart = subDays(new Date(), 65);
  for (let idx = 0; idx < employees.length; idx += 1) {
    const emp = employees[idx];
    const assignedShift = shifts[idx % shifts.length];
    const daysPattern = idx % 2 === 0 ? [1, 2, 3, 4, 5] : [3, 4, 5, 6, 7];

    const existing = await prisma.employeeShiftAssignment.findFirst({
      where: { employeeId: emp.id, shiftId: assignedShift.id },
    });

    if (!existing) {
      await prisma.employeeShiftAssignment.create({
        data: {
          employeeId: emp.id,
          shiftId: assignedShift.id,
          daysOfWeek: daysPattern,
          validFrom: rotaStart,
          validTo: null,
        },
      });
    }
  }

  return { shifts, employees };
}

async function seedAttendanceHistory(
  employees: { id: string; employeeCode: string; firstName: string; lastName: string }[],
  shifts: { id: string; startMinute: number; endMinute: number; unpaidBreakMinutes: number }[]
) {
  console.log("Seeding realistic attendance history (60 days) and active today clock-ins...");
  const branches = await prisma.branch.findMany({ where: { isActive: true } });
  if (branches.length === 0) return;

  const targetEmployees = employees.slice(0, 70);
  const now = new Date();

  // Part 1: 60-Day Historical Attendance (Days 60 down to 1)
  for (let dayOffset = 60; dayOffset >= 1; dayOffset -= 1) {
    const targetDate = subDays(now, dayOffset);
    const dateKey = toDateKey(targetDate);
    const isoDayOfWeek = targetDate.getUTCDay() === 0 ? 7 : targetDate.getUTCDay();

    for (let eIdx = 0; eIdx < targetEmployees.length; eIdx += 1) {
      const emp = targetEmployees[eIdx];
      const shift = shifts[eIdx % shifts.length];
      const branch = branches[eIdx % branches.length];

      const worksToday = (eIdx % 2 === 0 && isoDayOfWeek <= 5) || (eIdx % 2 === 1 && isoDayOfWeek >= 3);
      if (!worksToday) continue;

      const scheduleStart = new Date(`${dateKey}T00:00:00.000Z`);
      scheduleStart.setUTCMinutes(shift.startMinute);

      const scheduleEnd = new Date(`${dateKey}T00:00:00.000Z`);
      if (shift.endMinute < shift.startMinute) {
        scheduleEnd.setUTCDate(scheduleEnd.getUTCDate() + 1);
      }
      scheduleEnd.setUTCMinutes(shift.endMinute);

      const scheduledMinutes = Math.round((scheduleEnd.getTime() - scheduleStart.getTime()) / 60000);

      const randomMod = (eIdx * 7 + dayOffset) % 100;
      let actualIn: Date | null = null;
      let actualOut: Date | null = null;
      let isTardy = false;
      let isOvertime = false;
      let isMissingCheckout = false;

      if (randomMod < 72) {
        const inJitter = ((eIdx + dayOffset) % 7) - 3;
        actualIn = new Date(scheduleStart.getTime() + inJitter * 60000);
        const outJitter = ((eIdx * 3 + dayOffset) % 10);
        actualOut = new Date(scheduleEnd.getTime() + outJitter * 60000);
      } else if (randomMod < 86) {
        isTardy = true;
        const lateMinutes = 15 + ((eIdx * 5 + dayOffset) % 25);
        actualIn = new Date(scheduleStart.getTime() + lateMinutes * 60000);
        actualOut = new Date(scheduleEnd.getTime() + 5 * 60000);
      } else if (randomMod < 95) {
        isOvertime = true;
        actualIn = new Date(scheduleStart.getTime() - 2 * 60000);
        const extraMinutes = 60 + ((eIdx * 11 + dayOffset) % 60);
        actualOut = new Date(scheduleEnd.getTime() + extraMinutes * 60000);
      } else {
        isMissingCheckout = true;
        actualIn = new Date(scheduleStart.getTime() + 2 * 60000);
        actualOut = null;
      }

      const inKey = `dev_seed_evt_${emp.id}_${dateKey}_in`;
      const existingIn = await prisma.attendanceEvent.findFirst({
        where: { idempotencyKey: inKey },
        select: { id: true },
      });

      let inEventId = existingIn?.id;
      if (!existingIn && actualIn) {
        const createdIn = await prisma.attendanceEvent.create({
          data: {
            employeeId: emp.id,
            branchId: branch.id,
            direction: AttendanceDirection.IN,
            providerType: ProviderType.MOBILE_APP,
            deviceId: `device_${emp.id}`,
            occurredAt: actualIn,
            sourceReportedAt: actualIn,
            idempotencyKey: inKey,
            identityAssurance: IdentityAssurance.DEVICE_BOUND,
            locationAssurance: LocationAssurance.GPS_VERIFIED,
            timeAssurance: TimeAssurance.SERVER,
            verificationOutcome: VerificationOutcome.VERIFIED,
            flags: isTardy ? ["TARDY"] : [],
          },
          select: { id: true },
        });
        inEventId = createdIn.id;

        await prisma.eventEvidence.create({
          data: {
            eventId: inEventId,
            latitude: branch.latitude ?? 5.6037,
            longitude: branch.longitude ?? -0.187,
            accuracyMeters: 12.5,
            distanceMeters: 25.0,
            geofenceDecision: GeofenceDecision.INSIDE,
            isMockLocation: false,
          },
        });
      }

      if (actualOut) {
        const outKey = `dev_seed_evt_${emp.id}_${dateKey}_out`;
        const existingOut = await prisma.attendanceEvent.findFirst({
          where: { idempotencyKey: outKey },
          select: { id: true },
        });

        if (!existingOut) {
          const createdOut = await prisma.attendanceEvent.create({
            data: {
              employeeId: emp.id,
              branchId: branch.id,
              direction: AttendanceDirection.OUT,
              providerType: ProviderType.MOBILE_APP,
              deviceId: `device_${emp.id}`,
              occurredAt: actualOut,
              sourceReportedAt: actualOut,
              idempotencyKey: outKey,
              identityAssurance: IdentityAssurance.DEVICE_BOUND,
              locationAssurance: LocationAssurance.GPS_VERIFIED,
              timeAssurance: TimeAssurance.SERVER,
              verificationOutcome: VerificationOutcome.VERIFIED,
              flags: isOvertime ? ["OVERTIME"] : [],
            },
            select: { id: true },
          });

          await prisma.eventEvidence.create({
            data: {
              eventId: createdOut.id,
              latitude: branch.latitude ?? 5.6037,
              longitude: branch.longitude ?? -0.187,
              accuracyMeters: 14.0,
              distanceMeters: 30.0,
              geofenceDecision: GeofenceDecision.INSIDE,
              isMockLocation: false,
            },
          });
        }
      }

      const grossMinutes = actualIn && actualOut ? Math.round((actualOut.getTime() - actualIn.getTime()) / 60000) : 0;
      const breakMinutes = actualOut ? shift.unpaidBreakMinutes : 0;
      const netWorkedMinutes = Math.max(0, grossMinutes - breakMinutes);
      const regularMinutes = Math.min(scheduledMinutes, netWorkedMinutes);
      const overtimeMinutes = Math.max(0, netWorkedMinutes - scheduledMinutes);
      const lateMinutes = actualIn && actualIn > scheduleStart ? Math.round((actualIn.getTime() - scheduleStart.getTime()) / 60000) : 0;

      const dayStatus = isMissingCheckout ? DayStatus.NEEDS_REVIEW : DayStatus.SETTLED;
      const dayFlags: string[] = [];
      if (isTardy) dayFlags.push("TARDY");
      if (isOvertime) dayFlags.push("OVERTIME");
      if (isMissingCheckout) dayFlags.push("MISSING_CHECKOUT", "UNRECORDED_DEPARTURE");

      const workDate = new Date(`${dateKey}T00:00:00.000Z`);

      await prisma.attendanceDay.upsert({
        where: {
          employeeId_workDate: {
            employeeId: emp.id,
            workDate,
          },
        },
        update: {
          branchId: branch.id,
          status: dayStatus,
          shiftIdSnapshot: shift.id,
          scheduledStart: scheduleStart,
          scheduledEnd: scheduleEnd,
          scheduledMinutes,
          actualIn,
          actualOut,
          breakMinutes,
          grossMinutes,
          netWorkedMinutes,
          regularMinutes,
          overtimeMinutes,
          lateMinutes,
          flags: dayFlags,
          lowestIdentityAssurance: IdentityAssurance.DEVICE_BOUND,
          lowestLocationAssurance: LocationAssurance.GPS_VERIFIED,
          lowestTimeAssurance: TimeAssurance.SERVER,
          settledAt: actualOut ? actualOut : null,
        },
        create: {
          employeeId: emp.id,
          branchId: branch.id,
          workDate,
          status: dayStatus,
          shiftIdSnapshot: shift.id,
          scheduledStart: scheduleStart,
          scheduledEnd: scheduleEnd,
          scheduledMinutes,
          actualIn,
          actualOut,
          breakMinutes,
          grossMinutes,
          netWorkedMinutes,
          regularMinutes,
          overtimeMinutes,
          lateMinutes,
          flags: dayFlags,
          lowestIdentityAssurance: IdentityAssurance.DEVICE_BOUND,
          lowestLocationAssurance: LocationAssurance.GPS_VERIFIED,
          lowestTimeAssurance: TimeAssurance.SERVER,
          settledAt: actualOut ? actualOut : null,
        },
      });
    }
  }

  // Part 2: TODAY (Day Offset = 0) with Active Clock-Ins
  const todayKey = toDateKey(now);
  const todayDate = new Date(`${todayKey}T00:00:00.000Z`);

  for (let eIdx = 0; eIdx < targetEmployees.length; eIdx += 1) {
    const emp = targetEmployees[eIdx];
    const shift = shifts[eIdx % shifts.length];
    const branch = branches[eIdx % branches.length];

    const scheduleStart = new Date(`${todayKey}T00:00:00.000Z`);
    scheduleStart.setUTCMinutes(shift.startMinute);

    const scheduleEnd = new Date(`${todayKey}T00:00:00.000Z`);
    if (shift.endMinute < shift.startMinute) {
      scheduleEnd.setUTCDate(scheduleEnd.getUTCDate() + 1);
    }
    scheduleEnd.setUTCMinutes(shift.endMinute);

    const scheduledMinutes = Math.round((scheduleEnd.getTime() - scheduleStart.getTime()) / 60000);

    // Categories for today:
    // 0: CURRENTLY CLOCKED IN (ON_DUTY on live board and mobile app)
    // 1: COMPLETED TODAY (worked morning shift and punched out)
    // 2: SCHEDULED AWAITING (scheduled but not yet punched in)
    const category = eIdx % 3;

    if (category === 0) {
      // Currently clocked in (e.g. clocked in 1.5 to 4.5 hours ago)
      const hoursAgo = 1.5 + ((eIdx * 7) % 3);
      const actualIn = new Date(now.getTime() - hoursAgo * 3600000);
      const inKey = `dev_seed_evt_${emp.id}_${todayKey}_in`;

      const existingIn = await prisma.attendanceEvent.findFirst({
        where: { idempotencyKey: inKey },
        select: { id: true },
      });

      if (!existingIn) {
        const createdIn = await prisma.attendanceEvent.create({
          data: {
            employeeId: emp.id,
            branchId: branch.id,
            direction: AttendanceDirection.IN,
            providerType: ProviderType.MOBILE_APP,
            deviceId: `device_${emp.id}`,
            occurredAt: actualIn,
            sourceReportedAt: actualIn,
            idempotencyKey: inKey,
            identityAssurance: IdentityAssurance.DEVICE_BOUND,
            locationAssurance: LocationAssurance.GPS_VERIFIED,
            timeAssurance: TimeAssurance.SERVER,
            verificationOutcome: VerificationOutcome.VERIFIED,
            flags: [],
          },
          select: { id: true },
        });

        await prisma.eventEvidence.create({
          data: {
            eventId: createdIn.id,
            latitude: branch.latitude ?? 5.6037,
            longitude: branch.longitude ?? -0.187,
            accuracyMeters: 10.0,
            distanceMeters: 15.0,
            geofenceDecision: GeofenceDecision.INSIDE,
            isMockLocation: false,
          },
        });
      }

      const grossMinutes = Math.round((now.getTime() - actualIn.getTime()) / 60000);
      const netWorkedMinutes = grossMinutes;

      await prisma.attendanceDay.upsert({
        where: {
          employeeId_workDate: {
            employeeId: emp.id,
            workDate: todayDate,
          },
        },
        update: {
          branchId: branch.id,
          status: DayStatus.PENDING,
          shiftIdSnapshot: shift.id,
          scheduledStart: scheduleStart,
          scheduledEnd: scheduleEnd,
          scheduledMinutes,
          actualIn,
          actualOut: null,
          breakMinutes: 0,
          grossMinutes,
          netWorkedMinutes: grossMinutes,
          regularMinutes: Math.min(scheduledMinutes, grossMinutes),
          overtimeMinutes: Math.max(0, grossMinutes - scheduledMinutes),
          lateMinutes: 0,
          flags: [],
          lowestIdentityAssurance: IdentityAssurance.DEVICE_BOUND,
          lowestLocationAssurance: LocationAssurance.GPS_VERIFIED,
          lowestTimeAssurance: TimeAssurance.SERVER,
          settledAt: null,
        },
        create: {
          employeeId: emp.id,
          branchId: branch.id,
          workDate: todayDate,
          status: DayStatus.PENDING,
          shiftIdSnapshot: shift.id,
          scheduledStart: scheduleStart,
          scheduledEnd: scheduleEnd,
          scheduledMinutes,
          actualIn,
          actualOut: null,
          breakMinutes: 0,
          grossMinutes,
          netWorkedMinutes,
          regularMinutes: Math.min(scheduledMinutes, grossMinutes),
          overtimeMinutes: Math.max(0, grossMinutes - scheduledMinutes),
          lateMinutes: 0,
          flags: [],
          lowestIdentityAssurance: IdentityAssurance.DEVICE_BOUND,
          lowestLocationAssurance: LocationAssurance.GPS_VERIFIED,
          lowestTimeAssurance: TimeAssurance.SERVER,
          settledAt: null,
        },
      });
    } else if (category === 1) {
      // Completed earlier today
      const actualIn = new Date(`${todayKey}T07:05:00.000Z`);
      const actualOut = new Date(`${todayKey}T15:35:00.000Z`);
      const inKey = `dev_seed_evt_${emp.id}_${todayKey}_in`;
      const outKey = `dev_seed_evt_${emp.id}_${todayKey}_out`;

      const existingIn = await prisma.attendanceEvent.findFirst({
        where: { idempotencyKey: inKey },
        select: { id: true },
      });

      if (!existingIn) {
        const createdIn = await prisma.attendanceEvent.create({
          data: {
            employeeId: emp.id,
            branchId: branch.id,
            direction: AttendanceDirection.IN,
            providerType: ProviderType.MOBILE_APP,
            deviceId: `device_${emp.id}`,
            occurredAt: actualIn,
            sourceReportedAt: actualIn,
            idempotencyKey: inKey,
            identityAssurance: IdentityAssurance.DEVICE_BOUND,
            locationAssurance: LocationAssurance.GPS_VERIFIED,
            timeAssurance: TimeAssurance.SERVER,
            verificationOutcome: VerificationOutcome.VERIFIED,
            flags: [],
          },
          select: { id: true },
        });

        await prisma.eventEvidence.create({
          data: {
            eventId: createdIn.id,
            latitude: branch.latitude ?? 5.6037,
            longitude: branch.longitude ?? -0.187,
            accuracyMeters: 12.0,
            distanceMeters: 20.0,
            geofenceDecision: GeofenceDecision.INSIDE,
            isMockLocation: false,
          },
        });
      }

      const existingOut = await prisma.attendanceEvent.findFirst({
        where: { idempotencyKey: outKey },
        select: { id: true },
      });

      if (!existingOut) {
        const createdOut = await prisma.attendanceEvent.create({
          data: {
            employeeId: emp.id,
            branchId: branch.id,
            direction: AttendanceDirection.OUT,
            providerType: ProviderType.MOBILE_APP,
            deviceId: `device_${emp.id}`,
            occurredAt: actualOut,
            sourceReportedAt: actualOut,
            idempotencyKey: outKey,
            identityAssurance: IdentityAssurance.DEVICE_BOUND,
            locationAssurance: LocationAssurance.GPS_VERIFIED,
            timeAssurance: TimeAssurance.SERVER,
            verificationOutcome: VerificationOutcome.VERIFIED,
            flags: [],
          },
          select: { id: true },
        });

        await prisma.eventEvidence.create({
          data: {
            eventId: createdOut.id,
            latitude: branch.latitude ?? 5.6037,
            longitude: branch.longitude ?? -0.187,
            accuracyMeters: 14.0,
            distanceMeters: 22.0,
            geofenceDecision: GeofenceDecision.INSIDE,
            isMockLocation: false,
          },
        });
      }

      const grossMinutes = Math.round((actualOut.getTime() - actualIn.getTime()) / 60000);
      const breakMinutes = 30;
      const netWorkedMinutes = Math.max(0, grossMinutes - breakMinutes);

      await prisma.attendanceDay.upsert({
        where: {
          employeeId_workDate: {
            employeeId: emp.id,
            workDate: todayDate,
          },
        },
        update: {
          branchId: branch.id,
          status: DayStatus.SETTLED,
          shiftIdSnapshot: shift.id,
          scheduledStart: scheduleStart,
          scheduledEnd: scheduleEnd,
          scheduledMinutes,
          actualIn,
          actualOut,
          breakMinutes,
          grossMinutes,
          netWorkedMinutes,
          regularMinutes: Math.min(scheduledMinutes, netWorkedMinutes),
          overtimeMinutes: Math.max(0, netWorkedMinutes - scheduledMinutes),
          lateMinutes: 0,
          flags: [],
          lowestIdentityAssurance: IdentityAssurance.DEVICE_BOUND,
          lowestLocationAssurance: LocationAssurance.GPS_VERIFIED,
          lowestTimeAssurance: TimeAssurance.SERVER,
          settledAt: actualOut,
        },
        create: {
          employeeId: emp.id,
          branchId: branch.id,
          workDate: todayDate,
          status: DayStatus.SETTLED,
          shiftIdSnapshot: shift.id,
          scheduledStart: scheduleStart,
          scheduledEnd: scheduleEnd,
          scheduledMinutes,
          actualIn,
          actualOut,
          breakMinutes,
          grossMinutes,
          netWorkedMinutes,
          regularMinutes: Math.min(scheduledMinutes, netWorkedMinutes),
          overtimeMinutes: Math.max(0, netWorkedMinutes - scheduledMinutes),
          lateMinutes: 0,
          flags: [],
          lowestIdentityAssurance: IdentityAssurance.DEVICE_BOUND,
          lowestLocationAssurance: LocationAssurance.GPS_VERIFIED,
          lowestTimeAssurance: TimeAssurance.SERVER,
          settledAt: actualOut,
        },
      });
    } else {
      // Scheduled awaiting clock in today
      await prisma.attendanceDay.upsert({
        where: {
          employeeId_workDate: {
            employeeId: emp.id,
            workDate: todayDate,
          },
        },
        update: {
          branchId: branch.id,
          status: DayStatus.PENDING,
          shiftIdSnapshot: shift.id,
          scheduledStart: scheduleStart,
          scheduledEnd: scheduleEnd,
          scheduledMinutes,
          actualIn: null,
          actualOut: null,
          breakMinutes: 0,
          grossMinutes: 0,
          netWorkedMinutes: 0,
          regularMinutes: 0,
          overtimeMinutes: 0,
          lateMinutes: 0,
          flags: [],
          lowestIdentityAssurance: null,
          lowestLocationAssurance: null,
          lowestTimeAssurance: null,
          settledAt: null,
        },
        create: {
          employeeId: emp.id,
          branchId: branch.id,
          workDate: todayDate,
          status: DayStatus.PENDING,
          shiftIdSnapshot: shift.id,
          scheduledStart: scheduleStart,
          scheduledEnd: scheduleEnd,
          scheduledMinutes,
          actualIn: null,
          actualOut: null,
          breakMinutes: 0,
          grossMinutes: 0,
          netWorkedMinutes: 0,
          regularMinutes: 0,
          overtimeMinutes: 0,
          lateMinutes: 0,
          flags: [],
          lowestIdentityAssurance: null,
          lowestLocationAssurance: null,
          lowestTimeAssurance: null,
          settledAt: null,
        },
      });
    }
  }
}

async function seedLeaveRequests(employees: { id: string }[], hrUser: { id: string }) {
  console.log("Seeding leave requests across various statuses...");
  const targetEmployees = employees.slice(0, 20);
  const now = new Date();

  const sampleLeaves = [
    { type: LeaveType.ANNUAL, daysAgo: 10, duration: 5, status: LeaveStatus.APPROVED, reason: "Scheduled family vacation" },
    { type: LeaveType.SICK, daysAgo: 18, duration: 2, status: LeaveStatus.APPROVED, reason: "Malaria treatment with medical note" },
    { type: LeaveType.CASUAL, daysAgo: 4, duration: 1, status: LeaveStatus.APPROVED, reason: "Urgent personal appointment" },
    { type: LeaveType.EMERGENCY, daysAgo: 2, duration: 1, status: LeaveStatus.APPROVED, reason: "Family domestic emergency" },
    { type: LeaveType.ANNUAL, daysAgo: -5, duration: 4, status: LeaveStatus.PENDING, reason: "Annual leave request for next week" },
    { type: LeaveType.CASUAL, daysAgo: -12, duration: 2, status: LeaveStatus.PENDING, reason: "Attending brother wedding ceremony" },
    { type: LeaveType.UNPAID, daysAgo: -20, duration: 5, status: LeaveStatus.PENDING, reason: "Personal study leave during exams" },
    { type: LeaveType.ANNUAL, daysAgo: 25, duration: 3, status: LeaveStatus.REJECTED, reason: "Leave during peak inventory period", notes: "Clashes with branch quarterly audit schedule" },
    { type: LeaveType.CASUAL, daysAgo: 14, duration: 1, status: LeaveStatus.REJECTED, reason: "Short notice leave request", notes: "No replacement coverage available on that date" },
  ];

  for (let idx = 0; idx < targetEmployees.length; idx += 1) {
    const emp = targetEmployees[idx];
    const template = sampleLeaves[idx % sampleLeaves.length];
    const startDate = subDays(now, template.daysAgo);
    const endDate = addDays(startDate, template.duration - 1);

    const existing = await prisma.leaveRequest.findFirst({
      where: {
        employeeId: emp.id,
        startDate,
      },
    });

    if (!existing) {
      await prisma.leaveRequest.create({
        data: {
          employeeId: emp.id,
          type: template.type,
          startDate,
          endDate,
          reason: template.reason,
          status: template.status,
          reviewedBy: template.status !== LeaveStatus.PENDING ? hrUser.id : null,
          reviewedAt: template.status !== LeaveStatus.PENDING ? subDays(startDate, 2) : null,
          managerNotes: template.notes ?? null,
        },
      });
    }
  }
}

async function seedCustomerFeedback() {
  console.log("Seeding customer feedback submissions and answers...");
  const branches = await prisma.branch.findMany({ where: { isActive: true } });
  const questions = await prisma.question.findMany({ where: { isActive: true }, orderBy: { order: "asc" } });
  if (branches.length === 0 || questions.length === 0) return;

  const now = new Date();
  const sampleRatings = [5, 5, 5, 4, 4, 5, 4, 3, 5, 4, 2, 5, 4, 5, 1];

  for (let dayOffset = 30; dayOffset >= 0; dayOffset -= 2) {
    const date = subDays(now, dayOffset);
    for (let bIdx = 0; bIdx < branches.length; bIdx += 1) {
      const branch = branches[bIdx];
      const submissionsCount = 1 + ((bIdx + dayOffset) % 3);

      for (let sIdx = 0; sIdx < submissionsCount; sIdx += 1) {
        const token = `dev_seed_fb_${branch.slug}_${dayOffset}_${sIdx}`;
        const baseScore = sampleRatings[(bIdx * 3 + dayOffset + sIdx) % sampleRatings.length];

        const existing = await prisma.feedbackSubmission.findUnique({
          where: { submissionToken: token },
        });

        if (!existing) {
          const submission = await prisma.feedbackSubmission.create({
            data: {
              submissionToken: token,
              branchId: branch.id,
              overallScore: baseScore,
              submittedAt: date,
            },
          });

          for (const q of questions) {
            const jitter = ((q.order + sIdx) % 3) - 1;
            const score = Math.max(1, Math.min(5, baseScore + jitter));
            await prisma.feedbackAnswer.create({
              data: {
                submissionId: submission.id,
                questionId: q.id,
                score,
              },
            });
          }
        }
      }
    }
  }
}

async function seedAssessments(employees: { id: string; firstName: string; lastName: string; email: string | null }[]) {
  console.log("Seeding HR assessments and completed attempts...");
  const existingAssessment = await prisma.assessment.findFirst({
    where: { title: "Customer Service Excellence 2026" },
  });

  let assessmentId = existingAssessment?.id;
  if (!existingAssessment) {
    const created = await prisma.assessment.create({
      data: {
        title: "Customer Service Excellence 2026",
        description: "Standards of hospitality, greetings, complaint handling and customer care.",
        status: AssessmentStatus.PUBLISHED,
        publishedAt: subDays(new Date(), 20),
        passMarkPercent: 75,
        invitationsExpire: true,
        invitationTtlHours: 168,
        sections: {
          create: [
            {
              title: "Guest Hospitality & Greeting Standards",
              order: 1,
              questions: {
                create: [
                  {
                    kind: AssessmentQuestionKind.SINGLE_CHOICE,
                    text: "What is the mandatory greeting window when a customer steps up to the counter?",
                    order: 1,
                    points: 5,
                    options: {
                      create: [
                        { text: "Within 5 seconds with a warm smile", order: 1, isCorrect: true },
                        { text: "Whenever you finish counting cash", order: 2, isCorrect: false },
                        { text: "Wait until the guest speaks first", order: 3, isCorrect: false },
                      ],
                    },
                  },
                  {
                    kind: AssessmentQuestionKind.SINGLE_CHOICE,
                    text: "How should an order be confirmed before taking payment?",
                    order: 2,
                    points: 5,
                    options: {
                      create: [
                        { text: "Repeat each item and quantity aloud to the guest", order: 1, isCorrect: true },
                        { text: "Hand over the slip silently", order: 2, isCorrect: false },
                        { text: "Only confirm if the customer asks", order: 3, isCorrect: false },
                      ],
                    },
                  },
                ],
              },
            },
            {
              title: "Complaint Resolution",
              order: 2,
              questions: {
                create: [
                  {
                    kind: AssessmentQuestionKind.SINGLE_CHOICE,
                    text: "What is the first step when a guest reports an incorrect food order?",
                    order: 1,
                    points: 5,
                    options: {
                      create: [
                        { text: "Listen attentively, apologize sincerely, and replace it immediately", order: 1, isCorrect: true },
                        { text: "Argue that the kitchen followed the receipt", order: 2, isCorrect: false },
                        { text: "Ask the guest to speak directly with the kitchen staff", order: 3, isCorrect: false },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });
    assessmentId = created.id;
  }

  if (!assessmentId) return;

  const targetEmployees = employees.slice(0, 15);
  for (let idx = 0; idx < targetEmployees.length; idx += 1) {
    const emp = targetEmployees[idx];
    const token = `dev_asmt_token_${emp.id}`;
    const tokenHash = makeTokenHash(token);

    const existingInvite = await prisma.assessmentInvitation.findUnique({
      where: { tokenHash },
    });

    if (!existingInvite) {
      const isCompleted = idx < 10;
      const isExpired = idx >= 13;

      const invite = await prisma.assessmentInvitation.create({
        data: {
          assessmentId,
          employeeId: emp.id,
          inviteeName: `${emp.firstName} ${emp.lastName}`,
          inviteeEmail: emp.email,
          tokenHash,
          expiresAt: isExpired ? subDays(new Date(), 2) : addDays(new Date(), 7),
          openedAt: isCompleted ? subDays(new Date(), 10) : null,
          createdAt: subDays(new Date(), 15),
        },
      });

      if (isCompleted) {
        const response = await prisma.assessmentResponse.create({
          data: {
            invitationId: invite.id,
            declaredName: `${emp.firstName} ${emp.lastName}`,
            declaredEmail: emp.email,
            startedAt: subDays(new Date(), 10),
            submittedAt: subDays(new Date(), 10),
            scoredPoints: idx % 3 === 0 ? 15 : 10,
            maxPoints: 15,
          },
        });

        const questions = await prisma.assessmentQuestion.findMany({
          where: { section: { assessmentId } },
          include: { options: true },
        });

        for (const q of questions) {
          const correctOpt = q.options.find((o) => o.isCorrect);
          const chosenOpt = idx % 3 === 0 ? correctOpt : q.options[0];
          await prisma.assessmentAnswer.create({
            data: {
              responseId: response.id,
              questionId: q.id,
              selectedOptionIds: chosenOpt ? [chosenOpt.id] : [],
              awardedPoints: chosenOpt?.isCorrect ? q.points : 0,
              possiblePoints: q.points,
            },
          });
        }
      }
    }
  }
}

async function seedAptitudeTests() {
  console.log("Seeding candidate aptitude tests and attempts...");
  const existing = await prisma.aptitudeTest.findFirst({
    where: { title: "Front of House Numerical Reasoning" },
  });

  let testId = existing?.id;
  if (!existing) {
    const created = await prisma.aptitudeTest.create({
      data: {
        title: "Front of House Numerical Reasoning",
        description: "Cash handling, currency math, discount calculation, and inventory math.",
        status: AptitudeTestStatus.PUBLISHED,
        publishedAt: subDays(new Date(), 15),
        passMarkPercent: 70,
        timeLimitMinutes: 20,
        sections: {
          create: [
            {
              title: "Basic Mathematics and Cash Arithmetic",
              order: 1,
              questions: {
                create: [
                  {
                    kind: AptitudeQuestionKind.SINGLE_CHOICE,
                    text: "A customer bill totals GHS 74.50. The customer pays with a GHS 100 note. What is the exact change due?",
                    order: 1,
                    points: 5,
                    options: {
                      create: [
                        { text: "GHS 25.50", order: 1, isCorrect: true },
                        { text: "GHS 26.50", order: 2, isCorrect: false },
                        { text: "GHS 24.50", order: 3, isCorrect: false },
                        { text: "GHS 35.50", order: 4, isCorrect: false },
                      ],
                    },
                  },
                  {
                    kind: AptitudeQuestionKind.SINGLE_CHOICE,
                    text: "A promotional combo offers a 10% discount on a GHS 120 meal. What is the final price?",
                    order: 2,
                    points: 5,
                    options: {
                      create: [
                        { text: "GHS 108.00", order: 1, isCorrect: true },
                        { text: "GHS 110.00", order: 2, isCorrect: false },
                        { text: "GHS 102.00", order: 3, isCorrect: false },
                        { text: "GHS 112.00", order: 4, isCorrect: false },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });
    testId = created.id;
  }

  if (!testId) return;

  const candidates = [
    { name: "Kwabena Boateng", email: "kwabena.boateng@example.com", score: 10, passed: true },
    { name: "Abena Serwaa", email: "abena.serwaa@example.com", score: 10, passed: true },
    { name: "Kofi Mensah", email: "kofi.mensah@example.com", score: 5, passed: false },
    { name: "Esi Amponsah", email: "esi.amponsah@example.com", score: 10, passed: true },
    { name: "Yaw Osei", email: "yaw.osei@example.com", score: null, passed: false },
  ];

  for (let idx = 0; idx < candidates.length; idx += 1) {
    const c = candidates[idx];
    const token = `dev_apt_token_${idx}`;
    const tokenHash = makeTokenHash(token);

    const existingInvite = await prisma.aptitudeInvitation.findUnique({
      where: { tokenHash },
    });

    if (!existingInvite) {
      const invite = await prisma.aptitudeInvitation.create({
        data: {
          testId,
          candidateName: c.name,
          candidateEmail: c.email,
          tokenHash,
          expiresAt: addDays(new Date(), 10),
          openedAt: c.score !== null ? subDays(new Date(), 5) : null,
          createdAt: subDays(new Date(), 8),
        },
      });

      if (c.score !== null) {
        const attempt = await prisma.aptitudeAttempt.create({
          data: {
            invitationId: invite.id,
            declaredName: c.name,
            declaredEmail: c.email,
            startedAt: subDays(new Date(), 5),
            deadlineAt: new Date(subDays(new Date(), 5).getTime() + 20 * 60000),
            submittedAt: new Date(subDays(new Date(), 5).getTime() + 14 * 60000),
            scoredPoints: c.score,
            maxPoints: 10,
            autoSubmitted: false,
            tabAbsences: idx === 2 ? [{ leftAt: subDays(new Date(), 5).toISOString(), durationMs: 6200 }] : [],
          },
        });

        const questions = await prisma.aptitudeQuestion.findMany({
          where: { section: { testId } },
          include: { options: true },
        });

        for (const q of questions) {
          const correctOpt = q.options.find((o) => o.isCorrect);
          const chosenOpt = c.passed ? correctOpt : q.options[1];
          await prisma.aptitudeAnswer.create({
            data: {
              attemptId: attempt.id,
              questionId: q.id,
              selectedOptionIds: chosenOpt ? [chosenOpt.id] : [],
              awardedPoints: chosenOpt?.isCorrect ? q.points : 0,
              possiblePoints: q.points,
            },
          });
        }
      }
    }
  }
}

async function seedDeviceIdentities(employees: { id: string; firstName: string; employeeCode: string }[]) {
  console.log("Seeding paired mobile device identities...");
  const target = employees.slice(0, 10);
  for (let idx = 0; idx < target.length; idx += 1) {
    const emp = target[idx];
    const externalId = `app_install_${emp.employeeCode.toLowerCase()}`;

    const existing = await prisma.employeeDeviceIdentity.findFirst({
      where: { employeeId: emp.id, providerType: ProviderType.MOBILE_APP },
    });

    if (!existing) {
      await prisma.employeeDeviceIdentity.create({
        data: {
          employeeId: emp.id,
          providerType: ProviderType.MOBILE_APP,
          externalId,
          deviceId: `device_${emp.employeeCode.toLowerCase()}`,
          label: `${emp.firstName} iPhone 15 Pro`,
          enrolledAt: subDays(new Date(), 25),
        },
      });
    }
  }
}

async function main() {
  console.log("Starting comprehensive development database seed...");
  await seedBaseQuestionsAndBranches();
  const { hrUser, areaAccra, areaTema, branchManagers } = await seedUsersAndRoles();
  await seedBranchFeedbackRecipients(branchManagers, hrUser, areaAccra, areaTema);
  const { shifts, employees } = await seedShiftsAndRotas();
  await seedAttendanceHistory(employees, shifts);
  await seedLeaveRequests(employees, hrUser);
  await seedCustomerFeedback();
  await seedAssessments(employees);
  await seedAptitudeTests();
  await seedDeviceIdentities(employees);
  console.log("Development database seeding completed successfully!");
}

main()
  .catch((err) => {
    console.error("Dev seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
