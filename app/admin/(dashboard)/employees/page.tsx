import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { UserPlus, Upload } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { can, requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { countEmployees, listEmployees } from "@/lib/modules/employees/server";
import { employeeListFilterSchema } from "@/lib/modules/employees/validation";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmployeeFilters } from "@/components/admin/employee-filters";

export const metadata: Metadata = { title: "Employees" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function EmployeesPage({ searchParams }: { searchParams: SearchParams }) {
  const { actor, scope } = await requireAnyBranchPermission("employee:read");

  const raw = await searchParams;
  const parsed = employeeListFilterSchema.safeParse({
    branchId: first(raw.branchId),
    status: first(raw.status),
    search: first(raw.search),
    page: first(raw.page),
  });
  const filters = parsed.success ? parsed.data : {};
  const page = filters.page ?? 1;

  const [employees, total, branches] = await Promise.all([
    listEmployees(scope, filters, { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    countEmployees(scope, filters),
    prisma.branch.findMany({
      where: scope.kind === "branches" ? { id: { in: scope.branchIds } } : undefined,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(targetPage: number) {
    const search = new URLSearchParams();
    if (filters.branchId) search.set("branchId", filters.branchId);
    if (filters.status) search.set("status", filters.status);
    if (filters.search) search.set("search", filters.search);
    if (targetPage !== 1) search.set("page", String(targetPage));
    const qs = search.toString();
    return qs ? `/admin/employees?${qs}` : "/admin/employees";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Employees</h1>
          <p className="text-sm text-muted-foreground">
            {scope.kind === "branches"
              ? "Employees at the branches you manage."
              : "Everyone on record."}
          </p>
        </div>
        {can(actor, "employee:write") && (
          <div className="flex gap-2">
            <Link href="/admin/employees/import" className={buttonVariants({ variant: "outline" })}>
              <Upload className="size-4" />
              Import
            </Link>
            <Link href="/admin/employees/new" className={buttonVariants()}>
              <UserPlus className="size-4" />
              Add employee
            </Link>
          </div>
        )}
      </div>

      <Suspense fallback={<div className="h-[74px]" />}>
        <EmployeeFilters branches={branches.map((b) => ({ id: b.id, label: b.name }))} />
      </Suspense>

      {total === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {Object.keys(filters).length > 0
            ? "No employees match the selected filters."
            : "No employees yet. Attendance cannot be recorded until someone is on record and assigned to a branch."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Branches</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell className="font-mono text-xs">{employee.employeeCode}</TableCell>
                <TableCell>
                  <Link href={`/admin/employees/${employee.id}`} className="font-medium underline">
                    {employee.firstName} {employee.lastName}
                  </Link>
                  {employee.jobTitle && (
                    <span className="block text-xs text-muted-foreground">{employee.jobTitle}</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {employee.email ?? <span className="italic">none on file</span>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {employee.branchAssignments.length === 0 ? (
                    // Without one they cannot clock in anywhere, which is worth
                    // saying rather than showing an empty cell.
                    <span className="text-destructive">Not assigned</span>
                  ) : (
                    employee.branchAssignments
                      .map((a) => `${a.branch.name}${a.isPrimary ? " (primary)" : ""}`)
                      .join(", ")
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={employee.status === "ACTIVE" ? "default" : "outline"}>
                    {employee.status.toLowerCase()}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total} total)
          </p>
          <div className="flex gap-1.5">
            <Link
              href={pageHref(page - 1)}
              aria-disabled={page <= 1}
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: page <= 1 ? "pointer-events-none opacity-50" : undefined,
              })}
            >
              Previous
            </Link>
            <Link
              href={pageHref(page + 1)}
              aria-disabled={page >= totalPages}
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: page >= totalPages ? "pointer-events-none opacity-50" : undefined,
              })}
            >
              Next
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
