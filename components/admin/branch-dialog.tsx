"use client";

import { useState } from "react";
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
}: {
  action: (prevState: BranchFormState, formData: FormData) => Promise<BranchFormState>;
  defaultValues?: { name: string; slug: string; location: string; isActive: boolean };
  submitLabel: string;
  title: string;
  description: string;
  trigger: React.ReactElement;
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
        <BranchForm
          action={action}
          defaultValues={defaultValues}
          submitLabel={submitLabel}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
