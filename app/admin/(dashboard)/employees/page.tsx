import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { SearchX, RotateCcw } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { can, requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { countEmployees, listEmployees } from "@/lib/modules/employees/server";
import { employeeListFilterSchema } from "@/lib/modules/employees/validation";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { EmployeeFilters } from "@/components/admin/employee-filters";
import { EmployeeTopActions } from "@/components/admin/employee-top-actions";
import { EmployeesTable } from "@/components/admin/employees-table";
import { DataTablePagination } from "@/components/admin/data-table-pagination";

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

  const actionSlot = <EmployeeTopActions canCreate={can(actor, "employees:create")} />;

  return (
    <div className="space-y-4">
      <Suspense fallback={<div className="h-[46px]" />}>
        <EmployeeFilters
          branches={branches.map((b) => ({ id: b.id, label: b.name }))}
          actionSlot={actionSlot}
        />
      </Suspense>

      {total === 0 ? (
        <Empty className="border py-12">
          <EmptyMedia variant="icon">
            <SearchX className="size-4" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>
              {Object.keys(filters).length > 0 ? "No matching employees" : "No employees yet"}
            </EmptyTitle>
            <EmptyDescription>
              {Object.keys(filters).length > 0
                ? "No employees match your current filter or search criteria."
                : "No employees yet. Attendance cannot be recorded until someone is on record and assigned to a branch."}
            </EmptyDescription>
          </EmptyHeader>
          {Object.keys(filters).length > 0 && (
            <EmptyContent>
              <Link href="/admin/employees" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <RotateCcw className="size-3.5" />
                Clear filters
              </Link>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <EmployeesTable employees={employees} />
      )}

      <DataTablePagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_SIZE}
        buildHref={pageHref}
      />
    </div>
  );
}
