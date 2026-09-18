"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { BranchFormState } from "@/lib/modules/branches/actions";
import { BranchForm } from "@/components/admin/branch-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function BranchDialog({
  action,
  defaultValues,
  submitLabel,
  title,
  description,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  action: (prevState: BranchFormState, formData: FormData) => Promise<BranchFormState>;
  defaultValues?: React.ComponentProps<typeof BranchForm>["defaultValues"];
  submitLabel: string;
  title: string;
  description: string;
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setInternalOpen;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <BranchForm
          action={action}
          defaultValues={defaultValues}
          submitLabel={submitLabel}
          onSuccess={() => {
            setOpen(false);
            toast.success(defaultValues ? "Branch updated successfully" : "Branch created successfully");
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
