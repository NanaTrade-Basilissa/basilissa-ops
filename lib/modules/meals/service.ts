import "server-only";
import { prisma } from "@/lib/platform/prisma";
import { dateKeyInZone, shiftDateKey, formatAccraTime } from "@/lib/platform/date";
import { recordAuditBestEffort } from "@/lib/platform/audit";
import { isMealCutoffPassed, DEFAULT_MEAL_CUTOFF_HOUR } from "./constants";
import type { Actor } from "@/lib/modules/identity/authorization";
import { can } from "@/lib/modules/identity/authorization";
import { NotificationKind, ProviderType, type MealDecision } from "@prisma/client";
import { sendPushNotification, parseDeviceMetadata } from "@/lib/platform/push";

export interface SaveDayInput {
  date: string;
  dishName: string;
  description?: string | null;
  isEnabled?: boolean;
  cutoffHour?: number;
}

/**
 * Returns all 7 days of meal plans (Mon-Sun) for a branch in a given week,
 * including aggregate counts (portions confirmed, claimed, and opted out).
 */
export async function getWeeklyMealPlans(branchId: string, weekMonday: string) {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(shiftDateKey(weekMonday, i));
  }

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, name: true, slug: true, timezone: true },
  });
  if (!branch) throw new Error("Branch not found");

  const plans = await prisma.mealPlan.findMany({
    where: {
      branchId,
      date: { in: dates.map((d) => new Date(`${d}T00:00:00.000Z`)) },
    },
    include: {
      selections: {
        select: {
          decision: true,
          claimedAt: true,
        },
      },
    },
  });

  const holidays = await prisma.publicHoliday.findMany({
    where: {
      date: { in: dates.map((d) => new Date(`${d}T00:00:00.000Z`)) },
    },
    select: { date: true, name: true },
  });
  const holidayByDate = new Map(holidays.map((h) => [h.date.toISOString().slice(0, 10), h.name]));

  const planByDate = new Map<string, (typeof plans)[number]>();
  for (const p of plans) {
    const key = p.date.toISOString().slice(0, 10);
    planByDate.set(key, p);
  }

  const nowTime = new Date().getTime();
  const weekCutoffAt = plans.find((p) => p.cutoffAt !== null)?.cutoffAt?.toISOString() ?? null;

  const days = dates.map((dateKey) => {
    const existing = planByDate.get(dateKey);
    const confirmedCount = existing?.selections.filter((s) => s.decision === "EATING").length ?? 0;
    const optedOutCount = existing?.selections.filter((s) => s.decision === "NOT_EATING").length ?? 0;
    const claimedCount = existing?.selections.filter((s) => s.claimedAt !== null).length ?? 0;
    const isCutoff = existing?.cutoffAt
      ? nowTime >= existing.cutoffAt.getTime()
      : isMealCutoffPassed(dateKey, existing?.cutoffHour ?? DEFAULT_MEAL_CUTOFF_HOUR, branch.timezone);

    return {
      date: dateKey,
      planId: existing?.id ?? null,
      dishName: existing?.dishName ?? "",
      description: existing?.description ?? "",
      isEnabled: existing?.isEnabled ?? true,
      cutoffAt: existing?.cutoffAt ? existing.cutoffAt.toISOString() : null,
      cutoffHour: existing?.cutoffHour ?? DEFAULT_MEAL_CUTOFF_HOUR,
      isPublished: existing?.isPublished ?? false,
      isCutoffPassed: isCutoff,
      holidayName: holidayByDate.get(dateKey) ?? null,
      confirmedCount,
      optedOutCount,
      claimedCount,
    };
  });

  return { branch, weekMonday, weekCutoffAt, days };
}

/**
 * Saves or updates weekly meal plans for a branch and optionally publishes them.
 */
export async function saveWeeklyMealPlans(
  actor: Actor,
  branchId: string,
  days: SaveDayInput[],
  publish: boolean = false,
  cutoffAt?: Date | null,
) {
  if (!can(actor, "meals:write", { branchId })) {
    throw new Error("You do not have permission to manage meal plans for this branch.");
  }

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw new Error("Branch not found");

  const results = [];
  for (const day of days) {
    const date = new Date(`${day.date}T00:00:00.000Z`);
    const dishName = day.dishName.trim();
    const isEnabled = day.isEnabled ?? true;

    // Skip entirely empty new days if they have no dish name and are disabled
    if (!dishName && !isEnabled) {
      // If there's an existing record, update it to disabled
      const existing = await prisma.mealPlan.findUnique({
        where: { branchId_date: { branchId, date } },
      });
      if (existing) {
        const updated = await prisma.mealPlan.update({
          where: { id: existing.id },
          data: {
            isEnabled: false,
            ...(cutoffAt !== undefined ? { cutoffAt } : {}),
            ...(publish ? { isPublished: true, publishedAt: new Date() } : {}),
          },
        });
        results.push(updated);
      }
      continue;
    }

    if (!dishName) continue;

    const plan = await prisma.mealPlan.upsert({
      where: { branchId_date: { branchId, date } },
      create: {
        branchId,
        date,
        dishName,
        description: day.description?.trim() || null,
        isEnabled,
        cutoffHour: day.cutoffHour ?? DEFAULT_MEAL_CUTOFF_HOUR,
        cutoffAt: cutoffAt ?? null,
        isPublished: publish,
        publishedAt: publish ? new Date() : null,
      },
      update: {
        dishName,
        description: day.description?.trim() || null,
        isEnabled,
        cutoffHour: day.cutoffHour ?? DEFAULT_MEAL_CUTOFF_HOUR,
        ...(cutoffAt !== undefined ? { cutoffAt } : {}),
        ...(publish ? { isPublished: true, publishedAt: new Date() } : {}),
      },
    });

    results.push(plan);
  }

  await recordAuditBestEffort({
    actor: { userId: actor.userId, email: actor.email, role: null },
    action: publish ? "meals.published" : "meals.updated",
    entityType: "MealPlan",
    entityId: branchId,
    metadata: { branchId, daysCount: results.length, publish, cutoffAt: cutoffAt?.toISOString() },
  });

  return results;
}

/**
 * Returns the weekly menu and employee selections for the mobile app.
 */
export async function getEmployeeWeeklyMeals(employeeId: string, weekMonday: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      branchAssignments: {
        where: { validTo: null },
        include: { branch: true },
        orderBy: { isPrimary: "desc" },
      },
    },
  });

  if (!employee) throw new Error("Employee not found");
  const branchAssignment = employee.branchAssignments[0];
  if (!branchAssignment) throw new Error("No branch assigned to employee");
  const branch = branchAssignment.branch;

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    dates.push(shiftDateKey(weekMonday, i));
  }

  // Fetch meal plans
  const plans = await prisma.mealPlan.findMany({
    where: {
      branchId: branch.id,
      date: { in: dates.map((d) => new Date(`${d}T00:00:00.000Z`)) },
      isPublished: true,
    },
    include: {
      selections: {
        where: { employeeId },
      },
    },
  });

  // Fetch schedule exceptions for this employee (e.g. DAY_OFF)
  const exceptions = await prisma.scheduleException.findMany({
    where: {
      employeeId,
      date: { in: dates.map((d) => new Date(`${d}T00:00:00.000Z`)) },
    },
  });

  // Fetch public holidays
  const holidays = await prisma.publicHoliday.findMany({
    where: {
      date: { in: dates.map((d) => new Date(`${d}T00:00:00.000Z`)) },
    },
    select: { date: true, name: true },
  });
  const holidayByDate = new Map(holidays.map((h) => [h.date.toISOString().slice(0, 10), h.name]));

  const planMap = new Map(plans.map((p) => [p.date.toISOString().slice(0, 10), p]));
  const exceptionMap = new Map(exceptions.map((e) => [e.date.toISOString().slice(0, 10), e]));

  const nowTime = new Date().getTime();
  const weekCutoffAt = plans.find((p) => p.cutoffAt !== null)?.cutoffAt?.toISOString() ?? null;

  const days = dates.map((dateKey) => {
    const plan = planMap.get(dateKey);
    const exception = exceptionMap.get(dateKey);
    const isDayOff = exception?.type === "DAY_OFF";
    const selection = plan?.selections[0];
    const cutoffPassed = plan?.cutoffAt
      ? nowTime >= plan.cutoffAt.getTime()
      : isMealCutoffPassed(
          dateKey,
          plan?.cutoffHour ?? DEFAULT_MEAL_CUTOFF_HOUR,
          branch.timezone,
        );

    return {
      date: dateKey,
      hasPlan: Boolean(plan && plan.dishName),
      dishName: plan?.dishName ?? null,
      description: plan?.description ?? null,
      isEnabled: plan ? plan.isEnabled : false,
      cutoffHour: plan?.cutoffHour ?? DEFAULT_MEAL_CUTOFF_HOUR,
      cutoffAt: plan?.cutoffAt?.toISOString() ?? null,
      isCutoffPassed: cutoffPassed,
      isDayOff,
      holidayName: holidayByDate.get(dateKey) ?? null,
      decision: selection?.decision ?? null,
      claimedAt: selection?.claimedAt?.toISOString() ?? null,
    };
  });

  return {
    branch: { id: branch.id, name: branch.name, slug: branch.slug },
    weekMonday,
    weekCutoffAt,
    days,
  };
}

/**
 * Saves employee's choices for the week.
 */
export async function submitEmployeeMealSelections(
  employeeId: string,
  selections: { date: string; decision: MealDecision }[],
) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      branchAssignments: {
        where: { validTo: null },
        include: { branch: true },
        orderBy: { isPrimary: "desc" },
      },
    },
  });
  if (!employee) throw new Error("Employee not found");
  const branch = employee.branchAssignments[0]?.branch;
  if (!branch) throw new Error("Employee has no active branch assignment");

  const nowTime = new Date().getTime();
  const results = [];
  for (const item of selections) {
    const date = new Date(`${item.date}T00:00:00.000Z`);

    const plan = await prisma.mealPlan.findUnique({
      where: { branchId_date: { branchId: branch.id, date } },
    });
    if (!plan || !plan.isPublished || !plan.isEnabled) {
      continue;
    }

    const cutoffPassed = plan.cutoffAt
      ? nowTime >= plan.cutoffAt.getTime()
      : isMealCutoffPassed(item.date, plan.cutoffHour, branch.timezone);

    if (cutoffPassed) {
      continue; // Cutoff passed: lock out modifications
    }

    const saved = await prisma.mealSelection.upsert({
      where: { mealPlanId_employeeId: { mealPlanId: plan.id, employeeId } },
      create: {
        mealPlanId: plan.id,
        employeeId,
        decision: item.decision,
      },
      update: {
        decision: item.decision,
      },
    });

    results.push(saved);
  }

  return { ok: true, count: results.length };
}

/**
 * Claims a meal when the employee scans the permanent wall QR.
 */
export async function claimMealByWallScan(employeeId: string, branchSlug: string) {
  const branch = await prisma.branch.findUnique({
    where: { slug: branchSlug },
  });
  if (!branch) {
    return { ok: false, status: "BRANCH_NOT_FOUND", message: "Invalid branch QR code." };
  }

  const todayKey = dateKeyInZone(new Date(), branch.timezone);
  const todayDate = new Date(`${todayKey}T00:00:00.000Z`);

  const plan = await prisma.mealPlan.findUnique({
    where: { branchId_date: { branchId: branch.id, date: todayDate } },
  });

  if (!plan || !plan.isPublished || !plan.isEnabled) {
    return {
      ok: false,
      status: "NO_MEAL_TODAY",
      message: "No staff meal is scheduled at this branch today.",
    };
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, firstName: true, lastName: true, employeeCode: true },
  });
  if (!employee) {
    return { ok: false, status: "EMPLOYEE_NOT_FOUND", message: "Employee record not found." };
  }

  const selection = await prisma.mealSelection.findUnique({
    where: { mealPlanId_employeeId: { mealPlanId: plan.id, employeeId } },
  });

  if (!selection || selection.decision !== "EATING") {
    return {
      ok: false,
      status: "NOT_ORDERED",
      dishName: plan.dishName,
      message: "You did not reserve a meal for today (or opted out).",
    };
  }

  if (selection.claimedAt !== null) {
    return {
      ok: false,
      status: "ALREADY_CLAIMED",
      dishName: plan.dishName,
      claimedAt: selection.claimedAt.toISOString(),
      message: `Meal was already collected at ${formatAccraTime(selection.claimedAt)}.`,
    };
  }

  const updated = await prisma.mealSelection.update({
    where: { id: selection.id },
    data: {
      claimedAt: new Date(),
      claimVerifiedBy: "WALL_QR",
    },
  });

  return {
    ok: true,
    status: "APPROVED",
    dishName: plan.dishName,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    employeeCode: employee.employeeCode,
    claimedAt: updated.claimedAt!.toISOString(),
  };
}

/**
 * Headcount status for the live serving screen in the kitchen.
 */
export async function getLiveServingStation(branchId: string, targetDateKey?: string) {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw new Error("Branch not found");

  const dateKey = targetDateKey ?? dateKeyInZone(new Date(), branch.timezone);
  const date = new Date(`${dateKey}T00:00:00.000Z`);

  const plan = await prisma.mealPlan.findUnique({
    where: { branchId_date: { branchId, date } },
    include: {
      selections: {
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true, jobTitle: true },
          },
        },
      },
    },
  });

  const eatingSelections = plan?.selections.filter((s) => s.decision === "EATING") ?? [];
  const claimedCount = eatingSelections.filter((s) => s.claimedAt !== null).length;
  const totalPortions = eatingSelections.length;

  const claims = eatingSelections
    .filter((s) => s.claimedAt !== null)
    .sort((a, b) => b.claimedAt!.getTime() - a.claimedAt!.getTime())
    .map((s) => ({
      employeeName: `${s.employee.firstName} ${s.employee.lastName}`,
      employeeCode: s.employee.employeeCode,
      jobTitle: s.employee.jobTitle,
      claimedAt: s.claimedAt!.toISOString(),
      timeFormatted: formatAccraTime(s.claimedAt!),
    }));

  const pending = eatingSelections
    .filter((s) => s.claimedAt === null)
    .map((s) => ({
      employeeName: `${s.employee.firstName} ${s.employee.lastName}`,
      employeeCode: s.employee.employeeCode,
      jobTitle: s.employee.jobTitle,
    }));

  return {
    branchName: branch.name,
    branchSlug: branch.slug,
    dateKey,
    hasPlan: Boolean(plan),
    dishName: plan?.dishName ?? null,
    totalPortions,
    claimedCount,
    remainingCount: Math.max(0, totalPortions - claimedCount),
    claims,
    pending,
  };
}

/**
 * Broadcasts a push notification & in-app alert to staff when today's food is ready.
 */
export async function broadcastMealReadyNotification(branchId: string) {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, name: true, timezone: true },
  });
  if (!branch) throw new Error("Branch not found");

  const todayKey = dateKeyInZone(new Date(), branch.timezone);
  const todayDate = new Date(`${todayKey}T00:00:00.000Z`);

  const plan = await prisma.mealPlan.findUnique({
    where: { branchId_date: { branchId, date: todayDate } },
    include: {
      selections: {
        where: { decision: "EATING" },
        select: { employeeId: true, claimedAt: true },
      },
    },
  });

  if (!plan || !plan.isEnabled) {
    return {
      ok: false,
      error: "No active staff meal is scheduled for today at this branch.",
    };
  }

  const dishName = plan.dishName.trim() || "Staff Lunch";

  // Target employees: those who reserved "EATING" today
  let targetEmployeeIds: string[] = plan.selections.map((s) => s.employeeId);

  // If no pre-orders were made (e.g. ad-hoc meal), notify all active employees assigned to this branch
  if (targetEmployeeIds.length === 0) {
    const branchEmployees = await prisma.employeeBranchAssignment.findMany({
      where: { branchId, validTo: null },
      select: { employeeId: true },
    });
    targetEmployeeIds = branchEmployees.map((b) => b.employeeId);
  }

  if (targetEmployeeIds.length === 0) {
    return {
      ok: false,
      error: "No active employees found to notify for this branch.",
    };
  }

  // Find push tokens for target employees
  const devices = await prisma.employeeDeviceIdentity.findMany({
    where: {
      employeeId: { in: targetEmployeeIds },
      providerType: ProviderType.MOBILE_APP,
      revokedAt: null,
    },
    select: { label: true, employeeId: true },
  });

  const tokens: string[] = [];
  for (const device of devices) {
    const meta = parseDeviceMetadata(device.label);
    if (meta.pushToken) {
      tokens.push(meta.pushToken);
    }
  }

  const title = "🍽️ Food is Ready!";
  const body = `${dishName} is now ready and being served at the ${branch.name} kitchen counter. Come collect your meal!`;

  // 1. Send push notifications to devices
  let pushDispatched = 0;
  if (tokens.length > 0) {
    const receipts = await sendPushNotification(tokens, {
      title,
      body,
      sound: "default",
      priority: "high",
      data: {
        type: "STAFF_MEAL_READY",
        branchId,
        dishName,
      },
    });
    pushDispatched = receipts.filter((r) => r.ok).length;
  }

  // 2. Insert in-app notifications
  if (targetEmployeeIds.length > 0) {
    await prisma.notification.createMany({
      data: targetEmployeeIds.map((employeeId) => ({
        employeeId,
        kind: NotificationKind.ANNOUNCEMENT,
        title,
        body,
        data: {
          type: "STAFF_MEAL_READY",
          branchId,
          dishName,
        },
      })),
    });
  }

  return {
    ok: true,
    recipientCount: targetEmployeeIds.length,
    pushCount: pushDispatched,
    dishName,
    branchName: branch.name,
    notifiedAt: new Date().toISOString(),
  };
}
