"use client";

import { ClockAlert, Plus } from "lucide-react";
import { TopActionsBar } from "@/components/admin/top-actions-bar";
import { ManualPunchDialog, type EmployeeOption } from "@/components/admin/manual-punch-dialog";
import { AttendanceSweepButton } from "@/components/admin/attendance-sweep-button";

export type BranchOption = { id: string; name: string };

export function AttendanceTopActions({
  canManualEntry,
  canWrite,
  employees,
  branches,
  defaultBranchId,
  date,
}: {
  canManualEntry: boolean;
  canWrite: boolean;
  employees: EmployeeOption[];
  branches: BranchOption[];
  defaultBranchId?: string;
  date: string;
}) {
  const primaryAction = canManualEntry
    ? {
        label: "Manual punch",
        icon: Plus,
        dialog: (props: { open: boolean; onOpenChange: (open: boolean) => void }) => (
          <ManualPunchDialog
            open={props.open}
            onOpenChange={props.onOpenChange}
            trigger={null}
            employees={employees}
            branches={branches}
            defaultDate={date}
            defaultBranchId={defaultBranchId}
          />
        ),
      }
    : undefined;

  const secondaryActions = [
    canWrite && {
      id: "sweep",
      label: "Auto-close sweep",
      icon: ClockAlert,
      dialog: (props: { open: boolean; onOpenChange: (open: boolean) => void }) => (
        <AttendanceSweepButton
          open={props.open}
          onOpenChange={props.onOpenChange}
          trigger={null}
        />
      ),
    },
  ];

  if (!primaryAction && !secondaryActions.some(Boolean)) {
    return null;
  }

  return (
    <TopActionsBar
      primaryAction={primaryAction}
      secondaryActions={secondaryActions}
    />
  );
}
