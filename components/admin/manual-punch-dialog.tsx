"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { recordManualAttendanceDirect, type AttendanceActionState } from "@/lib/modules/attendance/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const MANUAL_REASONS = [
  ["DEVICE_OFFLINE", "Terminal was offline"],
  ["FORGOT_TO_PUNCH", "Employee forgot to punch"],
  ["PHONE_UNAVAILABLE", "Employee had no phone"],
  ["NEW_EMPLOYEE_NOT_ENROLLED", "New employee, not enrolled yet"],
  ["SYSTEM_OUTAGE", "System outage"],
  ["OTHER", "Other"],
] as const;

export type EmployeeOption = {
  id: string;
  name: string;
  employeeCode: string | null;
  branchAssignments: {
    branchId: string;
    branchName: string;
    isPrimary: boolean;
  }[];
};

export function ManualPunchDialog({
  employees,
  branches,
  defaultDate,
  defaultBranchId,
}: {
  employees: EmployeeOption[];
  branches: { id: string; name: string }[];
  defaultDate: string;
  defaultBranchId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [branchId, setBranchId] = useState(defaultBranchId ?? "");
  const [reason, setReason] = useState<string>("DEVICE_OFFLINE");
  const formId = useId();

  // Current time in HH:mm formatted for datetime-local
  const now = new Date();
  const defaultTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const [occurredAt, setOccurredAt] = useState(`${defaultDate}T${defaultTime}`);

  const [state, formAction, isPending] = useActionState<AttendanceActionState, FormData>(
    recordManualAttendanceDirect,
    undefined,
  );

  // Auto-detect branch when employee is selected
  function handleEmployeeChange(id: string) {
    setEmployeeId(id);
    const emp = employees.find((e) => e.id === id);
    if (emp && emp.branchAssignments.length > 0) {
      const primary = emp.branchAssignments.find((b) => b.isPrimary) ?? emp.branchAssignments[0];
      setBranchId(primary.branchId);
    } else if (defaultBranchId) {
      setBranchId(defaultBranchId);
    }
  }

  // Refresh router on success
  useEffect(() => {
    if (state?.saved) {
      toast.success(state.saved);
      router.refresh();
      const timer = setTimeout(() => {
        setOpen(false);
      }, 0);
      return () => clearTimeout(timer);
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  // Reset on open
  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      const freshNow = new Date();
      const freshTime = `${String(freshNow.getHours()).padStart(2, "0")}:${String(freshNow.getMinutes()).padStart(2, "0")}`;
      setOccurredAt(`${defaultDate}T${freshTime}`);
      if (defaultBranchId) setBranchId(defaultBranchId);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button size="sm" className="gap-1.5">
            <Plus className="size-4" />
            Record punch
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="size-4" />
            Record attendance punch
          </DialogTitle>
          <DialogDescription>
            Record a manual clock-in or clock-out for an employee. Whether it counts as an
            IN or OUT is derived automatically from previous punches.
          </DialogDescription>
        </DialogHeader>

        {state?.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        {state?.saved && (
          <Alert>
            <CheckCircle2 className="size-4 text-emerald-600" />
            <AlertDescription className="text-emerald-800 dark:text-emerald-200">
              {state.saved}
            </AlertDescription>
          </Alert>
        )}

        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-employee`}>Employee</Label>
            <NativeSelect
              id={`${formId}-employee`}
              name="employeeId"
              required
              value={employeeId}
              onChange={(e) => handleEmployeeChange(e.target.value)}
              className="w-full"
            >
              <option value="">Select an employee...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} {emp.employeeCode ? `(${emp.employeeCode})` : ""}{" "}
                  {emp.branchAssignments.length > 0
                    ? `· ${emp.branchAssignments.map((b) => b.branchName).join(", ")}`
                    : ""}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-branch`}>Branch</Label>
              <NativeSelect
                id={`${formId}-branch`}
                name="branchId"
                required
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full"
              >
                <option value="">Select branch...</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-occurredAt`}>When it happened</Label>
              <Input
                id={`${formId}-occurredAt`}
                name="occurredAt"
                type="datetime-local"
                required
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-reasonCode`}>Why by hand</Label>
            <NativeSelect
              id={`${formId}-reasonCode`}
              name="reasonCode"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full"
            >
              {MANUAL_REASONS.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-reasonText`}>
              Details {reason === "OTHER" && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id={`${formId}-reasonText`}
              name="reasonText"
              required={reason === "OTHER"}
              placeholder={reason === "OTHER" ? "Explain why manual entry was needed" : "Optional notes"}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Manual punches are attributed to your account and subject to audit. You cannot record
            your own attendance.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !employeeId || !branchId}>
              {isPending && <Loader2 className="size-4 animate-spin mr-1.5" />}
              Save punch
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
