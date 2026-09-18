"use client";

import { UserPlus, Upload } from "lucide-react";
import { TopActionsBar } from "@/components/admin/top-actions-bar";
import { EmployeeDialog } from "@/components/admin/employee-dialog";
import { createEmployee } from "@/lib/modules/employees/actions";

export function EmployeeTopActions({ canCreate }: { canCreate: boolean }) {
  if (!canCreate) return null;

  return (
    <TopActionsBar
      primaryAction={{
        label: "Add employee",
        icon: UserPlus,
        dialog: (props) => <EmployeeDialog action={createEmployee} {...props} />,
      }}
      secondaryActions={[
        {
          id: "import",
          label: "Import employees",
          icon: Upload,
          href: "/admin/employees/import",
        },
      ]}
    />
  );
}
