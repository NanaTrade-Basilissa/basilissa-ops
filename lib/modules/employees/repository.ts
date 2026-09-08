import "server-only";
import { prisma } from "@/lib/platform/prisma";
import type { BranchScope } from "@/lib/modules/identity/authorization";

/**
 * Employee reads, constrained by what the caller may see.
 *
 * Branch scoping is applied in the query rather than after it. Filtering a list
 * once it has been fetched is not authorisation — a manager could still reach
 * another branch's employee by its id.
 */
export async function listEmployees(scope: BranchScope) {
  if (scope.kind === "none") return [];

  return prisma.employee.findMany({
    where:
      scope.kind === "all"
        ? {}
        : { branchAssignments: { some: { branchId: { in: scope.branchIds } } } },
    orderBy: [{ status: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      jobTitle: true,
      status: true,
      masterSource: true,
      branchAssignments: {
        where: { validTo: null },
        select: { isPrimary: true, branch: { select: { id: true, name: true } } },
      },
    },
  });
}

/** One employee, or null when the caller may not see them. */
export async function getEmployee(employeeId: string, scope: BranchScope) {
  if (scope.kind === "none") return null;

  return prisma.employee.findFirst({
    where: {
      id: employeeId,
      ...(scope.kind === "branches"
        ? { branchAssignments: { some: { branchId: { in: scope.branchIds } } } }
        : {}),
    },
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      jobTitle: true,
      status: true,
      hireDate: true,
      terminationDate: true,
      masterSource: true,
      odooEmployeeId: true,
      branchAssignments: {
        orderBy: { validFrom: "desc" },
        select: {
          id: true,
          isPrimary: true,
          validFrom: true,
          validTo: true,
          branch: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export async function listShiftAssignments(employeeId: string) {
  return prisma.employeeShiftAssignment.findMany({
    where: { employeeId },
    orderBy: { validFrom: "desc" },
    select: {
      id: true,
      daysOfWeek: true,
      validFrom: true,
      validTo: true,
      shift: { select: { id: true, name: true, startMinute: true, endMinute: true } },
    },
  });
}

export async function listShifts() {
  return prisma.shift.findMany({
    orderBy: [{ isActive: "desc" }, { startMinute: "asc" }],
    select: {
      id: true,
      name: true,
      branchId: true,
      startMinute: true,
      endMinute: true,
      unpaidBreakMinutes: true,
      isActive: true,
      _count: { select: { assignments: true } },
    },
  });
}

export async function getShift(shiftId: string) {
  return prisma.shift.findUnique({
    where: { id: shiftId },
    select: {
      id: true,
      name: true,
      branchId: true,
      startMinute: true,
      endMinute: true,
      unpaidBreakMinutes: true,
      isActive: true,
    },
  });
}
