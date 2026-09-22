"use server";

import { revalidatePath } from "next/cache";
import { Prisma, ProviderType } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import {
  auditActorFrom,
  can,
  requireAnyBranchPermission,
  requireAuth,
  requireBranchPermission,
  requirePermission,
} from "@/lib/modules/identity/server";
import { auditSnapshot, recordAudit } from "@/lib/platform/audit";
import { fieldErrorsFrom, type FormState } from "@/lib/platform/forms";
import {
  branchAssignmentSchema,
  devicePinLinkSchema,
  employeeInputSchema,
  shiftAssignmentSchema,
  shiftInputSchema,
} from "./validation";
import { branchSpecBySlug, parseEmployeeWorkbook, resolveImportRows, type ResolvedImportRow } from "./import";
import { getEmployee, listShiftAssignments, listShifts } from "./repository";
import { getEmployeeAttendanceHistory } from "@/lib/modules/attendance/server";

export type { ResolvedImportRow } from "./import";



const EMPLOYEE_FIELDS = [
  "employeeCode",
  "firstName",
  "lastName",
  "email",
  "phone",
  "jobTitle",
  "status",
  "hireDate",
] as const;

function parseEmployee(formData: FormData) {
  return employeeInputSchema.safeParse({
    employeeCode: formData.get("employeeCode"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    jobTitle: formData.get("jobTitle"),
    status: formData.get("status"),
    hireDate: formData.get("hireDate"),
  });
}

export async function createEmployee(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("employees:create");

  const parsed = parseEmployee(formData);
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        // masterSource defaults to LOCAL: until Odoo exists the platform owns
        // this record, and adoption later links it rather than recreating it.
        data: parsed.data,
      });
      await recordAudit(
        {
          actor: auditActorFrom(actor),
          action: "employee.created",
          entityType: "Employee",
          entityId: employee.id,
          after: auditSnapshot(employee, EMPLOYEE_FIELDS),
        },
        tx,
      );
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        error: "That employee code is already in use.",
        fieldErrors: { employeeCode: "Already in use" },
      };
    }
    throw error;
  }

  revalidatePath("/admin/employees");
  return { success: true };
}

export async function updateEmployee(
  employeeId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("employees:update");

  const parsed = parseEmployee(formData);
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.employee.findUniqueOrThrow({ where: { id: employeeId } });
      const after = await tx.employee.update({
        where: { id: employeeId },
        data: {
          ...parsed.data,
          // Terminating stamps the date; un-terminating clears it, so the two
          // cannot disagree about whether someone still works here.
          terminationDate:
            parsed.data.status === "TERMINATED" ? (before.terminationDate ?? new Date()) : null,
        },
      });
      await recordAudit(
        {
          actor: auditActorFrom(actor),
          action:
            before.status !== after.status ? `employee.${after.status.toLowerCase()}` : "employee.updated",
          entityType: "Employee",
          entityId: employeeId,
          before: auditSnapshot(before, EMPLOYEE_FIELDS),
          after: auditSnapshot(after, EMPLOYEE_FIELDS),
        },
        tx,
      );
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        error: "That employee code is already in use.",
        fieldErrors: { employeeCode: "Already in use" },
      };
    }
    throw error;
  }

  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/admin/employees");
  return { success: true };
}

/**
 * Assigns an employee to a branch.
 *
 * Effective-dated and never mutated: an existing open assignment for the same
 * branch is closed and a new one opened, so attendance recorded last month
 * still resolves against the branch the employee actually worked at.
 */
export async function assignBranch(
  employeeId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("employee:write");

  const parsed = branchAssignmentSchema.safeParse({
    branchId: formData.get("branchId"),
    isPrimary: formData.get("isPrimary") === "on",
    validFrom: formData.get("validFrom"),
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  await prisma.$transaction(async (tx) => {
    if (parsed.data.isPrimary) {
      // Exactly one primary at a time. Enforced here rather than by a partial
      // unique index, which Prisma cannot express and which would therefore
      // show as schema drift.
      await tx.employeeBranchAssignment.updateMany({
        where: { employeeId, isPrimary: true, validTo: null },
        data: { isPrimary: false },
      });
    }

    await tx.employeeBranchAssignment.updateMany({
      where: { employeeId, branchId: parsed.data.branchId, validTo: null },
      data: { validTo: parsed.data.validFrom },
    });

    const created = await tx.employeeBranchAssignment.create({
      data: { employeeId, ...parsed.data },
    });

    await recordAudit(
      {
        actor: auditActorFrom(actor),
        action: "employee.branch_assigned",
        entityType: "Employee",
        entityId: employeeId,
        after: {
          branchId: parsed.data.branchId,
          isPrimary: parsed.data.isPrimary,
          validFrom: parsed.data.validFrom.toISOString(),
          assignmentId: created.id,
        },
      },
      tx,
    );
  });

  revalidatePath(`/admin/employees/${employeeId}`);
  return { success: true };
}

export async function endBranchAssignment(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission("employee:write");
  const assignmentId = String(formData.get("assignmentId"));

  const assignment = await prisma.employeeBranchAssignment.update({
    where: { id: assignmentId },
    data: { validTo: new Date() },
    select: { employeeId: true, branchId: true },
  });

  await recordAudit({
    actor: auditActorFrom(actor),
    action: "employee.branch_unassigned",
    entityType: "Employee",
    entityId: assignment.employeeId,
    after: { branchId: assignment.branchId, endedAt: new Date().toISOString() },
  });

  revalidatePath(`/admin/employees/${assignment.employeeId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------

export type EmployeeImportCounts = {
  total: number;
  ready: number;
  duplicate: number;
  manual: number;
  blocked: number;
};

function countsFor(rows: ResolvedImportRow[]): EmployeeImportCounts {
  return {
    total: rows.length,
    ready: rows.filter((r) => r.status === "ready").length,
    duplicate: rows.filter((r) => r.status === "duplicate").length,
    manual: rows.filter((r) => r.status === "manual").length,
    blocked: rows.filter((r) => r.status === "blocked").length,
  };
}

async function resolveUpload(
  formData: FormData,
): Promise<
  | { rows: ResolvedImportRow[]; canCreateBranch: boolean; actor: Awaited<ReturnType<typeof requirePermission>> }
  | { error: string }
> {
  const actor = await requirePermission("employee:write");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to import." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const rawRows = await parseEmployeeWorkbook(buffer);
  if (rawRows.length === 0) {
    return { error: "No rows found. Expected columns: Department, Employee Name, Job Position, Work Email, Work Phone." };
  }

  const [branches, employees] = await Promise.all([
    prisma.branch.findMany({ select: { id: true, slug: true, name: true } }),
    prisma.employee.findMany({ select: { firstName: true, lastName: true } }),
  ]);
  const existingEmployeeNameKeys = new Set(
    employees.map((e) => `${e.firstName.toLowerCase()}|${e.lastName.toLowerCase()}`),
  );

  const canCreateBranch = can(actor, "branch:write");
  const rows = resolveImportRows(rawRows, branches, existingEmployeeNameKeys, canCreateBranch);
  return { rows, canCreateBranch, actor };
}

export type EmployeeImportPreview = { rows: ResolvedImportRow[]; counts: EmployeeImportCounts };

/** Parse + resolve only — no writes. Called directly from the client, not via a form. */
export async function previewEmployeeImport(
  formData: FormData,
): Promise<EmployeeImportPreview | { error: string }> {
  const resolved = await resolveUpload(formData);
  if ("error" in resolved) return resolved;

  return { rows: resolved.rows, counts: countsFor(resolved.rows) };
}

export type EmployeeImportResult = { counts: EmployeeImportCounts; problemRows: ResolvedImportRow[] };

const NEXT_EMPLOYEE_CODE_PATTERN = /^EMP(\d+)$/;

/**
 * Re-parses and re-resolves the same file rather than trusting a client-sent
 * preview, so what gets written is always exactly what `previewEmployeeImport`
 * showed — the two can never drift apart.
 */
export async function commitEmployeeImport(formData: FormData): Promise<EmployeeImportResult | { error: string }> {
  const resolved = await resolveUpload(formData);
  if ("error" in resolved) return resolved;

  const { rows, canCreateBranch, actor } = resolved;
  const readyRows = rows.filter((row) => row.status === "ready");

  await prisma.$transaction(async (tx) => {
    const branchIdBySlug = new Map<string, string>();
    for (const branch of await tx.branch.findMany({ select: { id: true, slug: true } })) {
      branchIdBySlug.set(branch.slug, branch.id);
    }

    if (canCreateBranch) {
      const neededSlugs = new Set(
        readyRows.filter((row) => row.needsNewBranch).map((row) => row.branchSlug),
      );
      for (const slug of neededSlugs) {
        if (branchIdBySlug.has(slug)) continue;
        const spec = branchSpecBySlug(slug);
        if (!spec) continue; // resolveImportRows would already have blocked this row otherwise

        const branch = await tx.branch.create({
          data: { slug: spec.slug, name: spec.name, location: spec.location },
        });
        branchIdBySlug.set(slug, branch.id);
        await recordAudit(
          {
            actor: auditActorFrom(actor),
            action: "branch.created",
            entityType: "Branch",
            entityId: branch.id,
            after: auditSnapshot(branch, ["name", "slug", "location"]),
            metadata: { reason: "employee_import" },
          },
          tx,
        );
      }
    }

    const codeRows = await tx.employee.findMany({
      where: { employeeCode: { startsWith: "EMP" } },
      select: { employeeCode: true },
    });
    let nextCode = codeRows.reduce((max, { employeeCode }) => {
      const match = NEXT_EMPLOYEE_CODE_PATTERN.exec(employeeCode);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);

    for (const row of readyRows) {
      const branchId = branchIdBySlug.get(row.branchSlug);
      if (!branchId) continue; // branch:write missing after all — resolveImportRows already blocks this case

      nextCode += 1;
      const employee = await tx.employee.create({
        data: {
          employeeCode: `EMP${String(nextCode).padStart(4, "0")}`,
          firstName: row.firstName!,
          lastName: row.lastName!,
          jobTitle: row.jobTitle,
          email: row.email,
          phone: row.phone,
          status: "ACTIVE",
        },
      });
      await recordAudit(
        {
          actor: auditActorFrom(actor),
          action: "employee.created",
          entityType: "Employee",
          entityId: employee.id,
          after: auditSnapshot(employee, EMPLOYEE_FIELDS),
          metadata: { reason: "employee_import", department: row.department },
        },
        tx,
      );

      await tx.employeeBranchAssignment.create({
        data: { employeeId: employee.id, branchId, isPrimary: true, validFrom: new Date() },
      });
    }

    await recordAudit(
      {
        actor: auditActorFrom(actor),
        action: "employee.bulk_imported",
        entityType: "Employee",
        entityId: "bulk",
        metadata: { total: rows.length, created: readyRows.length },
      },
      tx,
    );
  });

  revalidatePath("/admin/employees");
  revalidatePath("/admin/branches");

  return {
    counts: countsFor(rows),
    problemRows: rows.filter((row) => row.status !== "ready"),
  };
}

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------

const SHIFT_FIELDS = ["name", "startMinute", "endMinute", "unpaidBreakMinutes", "isActive"] as const;

function parseShift(formData: FormData) {
  const toMinutes = (value: FormDataEntryValue | null) => {
    const [hours, minutes] = String(value ?? "").split(":").map(Number);
    return (hours ?? 0) * 60 + (minutes ?? 0);
  };

  return shiftInputSchema.safeParse({
    name: formData.get("name"),
    branchId: formData.get("branchId"),
    startMinute: toMinutes(formData.get("startTime")),
    endMinute: toMinutes(formData.get("endTime")),
    unpaidBreakMinutes: formData.get("unpaidBreakMinutes"),
    isActive: formData.get("isActive") === "on",
  });
}

export async function createShift(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseShift(formData);
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const actor = parsed.data.branchId
    ? await requireBranchPermission("schedule:write", parsed.data.branchId)
    : await requirePermission("schedule:write");

  await prisma.$transaction(async (tx) => {
    const shift = await tx.shift.create({ data: parsed.data });
    await recordAudit(
      {
        actor: auditActorFrom(actor),
        action: "shift.created",
        entityType: "Shift",
        entityId: shift.id,
        after: auditSnapshot(shift, SHIFT_FIELDS),
      },
      tx,
    );
  });

  revalidatePath("/admin/shifts");
  return { success: true };
}

export async function updateShift(
  shiftId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseShift(formData);
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const existing = await prisma.shift.findUniqueOrThrow({ where: { id: shiftId } });
  const actor = existing.branchId
    ? await requireBranchPermission("schedule:write", existing.branchId)
    : await requirePermission("schedule:write");

  if (parsed.data.branchId && parsed.data.branchId !== existing.branchId) {
    await requireBranchPermission("schedule:write", parsed.data.branchId);
  }

  await prisma.$transaction(async (tx) => {
    const before = await tx.shift.findUniqueOrThrow({ where: { id: shiftId } });
    const after = await tx.shift.update({ where: { id: shiftId }, data: parsed.data });
    await recordAudit(
      {
        actor: auditActorFrom(actor),
        action: "shift.updated",
        entityType: "Shift",
        entityId: shiftId,
        before: auditSnapshot(before, SHIFT_FIELDS),
        after: auditSnapshot(after, SHIFT_FIELDS),
      },
      tx,
    );
  });

  revalidatePath("/admin/shifts");
  return { success: true };
}

/** Puts an employee on a shift from a date. Effective-dated, like branches. */
export async function assignShift(
  employeeId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAuth();

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { branchAssignments: { where: { validTo: null }, select: { branchId: true } } },
  });
  if (!employee) return { error: "Employee not found." };

  const employeeBranchIds = employee.branchAssignments.map((b) => b.branchId);
  const isAuthorized =
    can(actor, "schedule:write") ||
    employeeBranchIds.some((branchId) => can(actor, "schedule:write", { branchId }));

  if (!isAuthorized) {
    return { error: "You do not have permission to manage schedules for this employee." };
  }

  const parsed = shiftAssignmentSchema.safeParse({
    shiftId: formData.get("shiftId"),
    daysOfWeek: formData.getAll("daysOfWeek"),
    validFrom: formData.get("validFrom"),
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  await prisma.$transaction(async (tx) => {
    // Close whatever was open, so two rotas never both apply to a day.
    await tx.employeeShiftAssignment.updateMany({
      where: { employeeId, validTo: null },
      data: { validTo: parsed.data.validFrom },
    });

    await tx.employeeShiftAssignment.create({
      data: { employeeId, ...parsed.data, createdBy: actor.userId },
    });

    await recordAudit(
      {
        actor: auditActorFrom(actor),
        action: "employee.shift_assigned",
        entityType: "Employee",
        entityId: employeeId,
        after: {
          shiftId: parsed.data.shiftId,
          daysOfWeek: parsed.data.daysOfWeek,
          validFrom: parsed.data.validFrom.toISOString(),
        },
      },
      tx,
    );
  });

  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/admin/shifts");
  return { success: true };
}

/**
 * Thin read-only wrapper so a client component (the employee Sheet on the
 * list) can fetch one record, and re-fetch it after a mutation, without a
 * full page navigation. Same scoped lookup and permission checks the page
 * itself makes.
 */
export async function getEmployeeDetailAction(employeeId: string) {
  const { actor, scope } = await requireAnyBranchPermission("employee:read");

  const employee = await getEmployee(employeeId, scope);
  if (!employee) return null;

  const branchWhere =
    scope.kind === "branches"
      ? { id: { in: scope.branchIds }, isActive: true }
      : { isActive: true };

  const employeeBranchIds = employee.branchAssignments.map((b) => b.branch.id);
  const canWrite =
    can(actor, "employee:write") ||
    employeeBranchIds.some((branchId) => can(actor, "employee:write", { branchId }));
  const canSchedule =
    can(actor, "schedule:write") ||
    employeeBranchIds.some((branchId) => can(actor, "schedule:write", { branchId }));

  const canReadAttendance =
    can(actor, "attendance:read") ||
    employeeBranchIds.some((branchId) => can(actor, "attendance:read", { branchId }));

  const [branches, shifts, shiftAssignments, attendanceHistory, branchDevices] = await Promise.all([
    prisma.branch.findMany({ where: branchWhere, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    listShifts(scope),
    listShiftAssignments(employee.id),
    canReadAttendance ? getEmployeeAttendanceHistory(scope, employeeId) : null,
    // Fingerprint terminals at branches this employee is currently assigned
    // to — what the "link a PIN" UI offers. A device at a branch they're not
    // assigned to isn't offered; linkDevicePin refuses it too.
    prisma.device.findMany({
      where: { branchId: { in: employeeBranchIds }, isActive: true },
      orderBy: { registeredAt: "asc" },
      select: { id: true, serialNumber: true, label: true, branchId: true, branch: { select: { name: true } } },
    }),
  ]);

  return {
    employee,
    branches,
    shifts,
    shiftAssignments,
    canWrite,
    canSchedule,
    attendanceEnabled: true,
    attendanceHistory,
    branchDevices,
  };
}

export async function revokeDeviceIdentity(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAuth();
  const deviceIdentityId = String(formData.get("deviceIdentityId") || "");

  if (!deviceIdentityId) {
    return { success: false, error: "Device identity ID is required." };
  }

  const identity = await prisma.employeeDeviceIdentity.findUnique({
    where: { id: deviceIdentityId },
    include: {
      employee: {
        include: {
          branchAssignments: { where: { validTo: null }, select: { branchId: true } },
        },
      },
    },
  });

  if (!identity || identity.revokedAt !== null) {
    return { success: false, error: "Device identity not found or already released." };
  }

  const employeeBranchIds = identity.employee.branchAssignments.map((b) => b.branchId);
  const allowed =
    can(actor, "employee:write") ||
    employeeBranchIds.some((branchId) => can(actor, "employee:write", { branchId }));

  if (!allowed) {
    return { success: false, error: "You do not have permission to manage this employee's devices." };
  }

  await prisma.employeeDeviceIdentity.update({
    where: { id: deviceIdentityId },
    data: { revokedAt: new Date() },
  });

  await recordAudit({
    actor: auditActorFrom(actor),
    action: "employee.device_revoked",
    entityType: "Employee",
    entityId: identity.employeeId,
    before: { deviceId: identity.externalId, label: identity.label, providerType: identity.providerType },
    after: { revokedAt: new Date().toISOString() },
    metadata: { reason: "Admin/Manager released device for re-assignment" },
  });

  revalidatePath(`/admin/employees/${identity.employeeId}`);
  revalidatePath(`/admin/employees`);
  return { success: true };
}

/**
 * Links a fingerprint terminal PIN to an employee. The PIN itself comes from
 * whoever physically enrolled them on the device — this just records what it
 * means. Never creates the branch assignment itself; the employee must
 * already be assigned to the device's branch, matching the sequence HR
 * actually follows (assign branch, then enrol, then link the PIN).
 */
export async function linkDevicePin(
  employeeId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireAuth();

  const parsed = devicePinLinkSchema.safeParse({
    deviceId: formData.get("deviceId"),
    pin: formData.get("pin"),
  });
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const [employee, device] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: { branchAssignments: { where: { validTo: null }, select: { branchId: true } } },
    }),
    prisma.device.findUnique({ where: { id: parsed.data.deviceId } }),
  ]);

  if (!employee) return { error: "Employee not found." };
  if (!device) return { error: "Device not found." };

  const employeeBranchIds = employee.branchAssignments.map((b) => b.branchId);
  const allowed =
    can(actor, "employee:write") ||
    employeeBranchIds.some((branchId) => can(actor, "employee:write", { branchId }));
  if (!allowed) {
    return { error: "You do not have permission to manage this employee's devices." };
  }

  if (!employeeBranchIds.includes(device.branchId)) {
    return { error: "Employee is not assigned to this device's branch." };
  }

  // No database constraint enforces "one active employee per PIN per
  // device" — same reasoning as B9 (a partial unique index Prisma cannot
  // declare), so it's checked here instead.
  const conflict = await prisma.employeeDeviceIdentity.findFirst({
    where: {
      providerType: ProviderType.FINGERPRINT,
      deviceId: device.serialNumber,
      externalId: parsed.data.pin,
      revokedAt: null,
      employeeId: { not: employeeId },
    },
    select: { id: true },
  });
  if (conflict) {
    return {
      error: "That PIN is already linked to someone else on this device.",
      fieldErrors: { pin: "Already in use on this device" },
    };
  }

  await prisma.$transaction(async (tx) => {
    // A PIN changing (re-enrolment) closes the old link rather than
    // leaving two active ones — same reasoning as branch reassignment.
    await tx.employeeDeviceIdentity.updateMany({
      where: {
        employeeId,
        providerType: ProviderType.FINGERPRINT,
        deviceId: device.serialNumber,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    const created = await tx.employeeDeviceIdentity.create({
      data: {
        employeeId,
        providerType: ProviderType.FINGERPRINT,
        externalId: parsed.data.pin,
        deviceId: device.serialNumber,
        label: device.label,
      },
    });

    await recordAudit(
      {
        actor: auditActorFrom(actor),
        action: "employee.device_pin_linked",
        entityType: "Employee",
        entityId: employeeId,
        after: { deviceId: device.serialNumber, branchId: device.branchId, pin: parsed.data.pin, linkId: created.id },
      },
      tx,
    );
  });

  revalidatePath(`/admin/employees/${employeeId}`);
  return { success: true };
}


