import type { Metadata } from "next";
import { requirePermission } from "@/lib/modules/identity/server";
import { createEmployee } from "@/lib/modules/employees/actions";
import { EmployeeForm } from "@/components/admin/employee-form";

export const metadata: Metadata = { title: "Add employee" };
export const dynamic = "force-dynamic";

export default async function NewEmployeePage() {
  await requirePermission("employee:write");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Add employee</h1>
        <p className="text-sm text-muted-foreground">
          Assign a branch and a shift afterwards. Attendance needs both before it can be
          recorded or calculated.
        </p>
      </div>
      <EmployeeForm action={createEmployee} submitLabel="Create employee" />
    </div>
  );
}
