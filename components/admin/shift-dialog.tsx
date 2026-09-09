"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { FormState } from "@/lib/platform/forms";
import { ShiftForm } from "@/components/admin/shift-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ShiftDialog({
  action,
  branches,
  defaultValues,
  submitLabel,
  title,
  description,
  trigger,
  allowGlobal = true,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  branches: { id: string; name: string }[];
  defaultValues?: {
    name: string;
    branchId: string;
    startTime: string;
    endTime: string;
    unpaidBreakMinutes: number;
    isActive: boolean;
  };
  submitLabel: string;
  title: string;
  description: string;
  trigger: React.ReactElement;
  allowGlobal?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ShiftForm
          action={action}
          branches={branches}
          defaultValues={defaultValues}
          submitLabel={submitLabel}
          allowGlobal={allowGlobal}
          onSuccess={() => {
            setOpen(false);
            toast.success(defaultValues ? "Shift updated successfully" : "Shift created successfully");
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
