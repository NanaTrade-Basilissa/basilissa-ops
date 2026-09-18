"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { FormState } from "@/lib/platform/forms";
import { EmployeeForm } from "@/components/admin/employee-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function EmployeeDialog({
  action,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  trigger?: React.ReactElement | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = setControlledOpen ?? setInternalOpen;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add employee</DialogTitle>
          <DialogDescription>Assign a branch and shift afterwards.</DialogDescription>
        </DialogHeader>
        <EmployeeForm
          action={action}
          submitLabel="Create employee"
          onSuccess={() => {
            setOpen(false);
            toast.success("Employee created successfully");
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
