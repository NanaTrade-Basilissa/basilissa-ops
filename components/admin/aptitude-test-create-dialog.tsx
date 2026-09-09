"use client";

import { useState } from "react";
import type { AptitudeFormState } from "@/lib/modules/aptitude/actions";
import { AptitudeTestDetailsForm } from "@/components/admin/aptitude-test-details-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AptitudeTestCreateDialog({
  action,
  trigger,
}: {
  action: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New test</DialogTitle>
          <DialogDescription>
            Starts as a draft. Publishing freezes the questions and scoring so every
            candidate sits the same thing.
          </DialogDescription>
        </DialogHeader>
        <AptitudeTestDetailsForm action={action} submitLabel="Create draft" />
      </DialogContent>
    </Dialog>
  );
}
