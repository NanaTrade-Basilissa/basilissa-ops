import "server-only";
import type { Prisma, EmploymentStatus } from "@prisma/client";
import { prisma } from "@/lib/platform/prisma";
import type { BranchScope } from "@/lib/modules/identity/authorization";

export type EmployeeListFilters = {
  branchId?: string;
  status?: EmploymentStatus;
  /** Matched against name, employee code and email, case-insensitively. */
  search?: string;
};

/**
 * Intersects the reader's scope with their filters, same reasoning as
 * `feedbackListWhere`: merging the two (rather than letting a filter replace
 * the scope) is what stops `?branchId=` from widening a branch manager's
 * query past the branches they actually hold.
 */
function employeeListWhere(scope: BranchScope, filters: EmployeeListFilters): Prisma.EmployeeWhereInput {
  const clauses: Prisma.EmployeeWhereInput[] = [];

  if (scope.kind === "branches") {
    clauses.push({ branchAssignments: { some: { branchId: { in: scope.branchIds } } } });
  }

  if (filters.branchId) {
    clauses.push({ branchAssignments: { some: { branchId: filters.branchId, validTo: null } } });
  }
  if (filters.status) clauses.push({ status: filters.status });
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    clauses.push({
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { employeeCode: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  return clauses.length > 0 ? { AND: clauses } : {};
}

const EMPLOYEE_LIST_SELECT = {
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
} satisfies Prisma.EmployeeSelect;

/**
 * Employee reads, constrained by what the caller may see.
 *
 * Branch scoping is applied in the query rather than after it. Filtering a list
 * once it has been fetched is not authorisation — a manager could still reach
 * another branch's employee by its id.
 */
export async function listEmployees(
  scope: BranchScope,
  filters: EmployeeListFilters = {},
  pagination: { skip?: number; take?: number } = {},
) {
  if (scope.kind === "none") return [];

  return prisma.employee.findMany({
    where: employeeListWhere(scope, filters),
    orderBy: [{ status: "asc" }, { lastName: "asc" }],
    skip: pagination.skip,
    take: pagination.take,
    select: EMPLOYEE_LIST_SELECT,
  });
}

/** Total matching `listEmployees`' same scope and filters, for pagination. */
export async function countEmployees(scope: BranchScope, filters: EmployeeListFilters = {}): Promise<number> {
  if (scope.kind === "none") return 0;

  return prisma.employee.count({ where: employeeListWhere(scope, filters) });
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
