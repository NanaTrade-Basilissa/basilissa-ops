import type { Metadata } from "next";
import { requirePermission } from "@/lib/modules/identity/server";
import { EmployeeImport } from "@/components/admin/employee-import";

export const metadata: Metadata = { title: "Import employees" };
export const dynamic = "force-dynamic";

export default async function ImportEmployeesPage() {
  await requirePermission("employee:write");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Import employees</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Bulk import staff records via CSV.
        </p>
      </div>
      <EmployeeImport />
    </div>
  );
}
