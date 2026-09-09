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
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
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
