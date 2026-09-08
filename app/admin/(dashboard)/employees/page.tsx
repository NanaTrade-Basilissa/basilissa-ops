import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus, Upload } from "lucide-react";
import { can, requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { listEmployees } from "@/lib/modules/employees/server";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Employees" };
export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  // A manager sees their own branches; a global role sees everything.
  const { actor, scope } = await requireAnyBranchPermission("employee:read");
  const employees = await listEmployees(scope);

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

      {employees.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No employees yet. Attendance cannot be recorded until someone is on record and
          assigned to a branch.
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
    </div>
  );
}
