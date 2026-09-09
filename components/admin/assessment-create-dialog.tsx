"use client";

import { useState } from "react";
import type { AssessmentFormState } from "@/lib/modules/assessments/actions";
import { AssessmentDetailsForm } from "@/components/admin/assessment-details-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AssessmentCreateDialog({
  action,
  trigger,
}: {
  action: (prev: AssessmentFormState, formData: FormData) => Promise<AssessmentFormState>;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New assessment</DialogTitle>
          <DialogDescription>
            Starts as a draft. Publishing freezes the questions and scoring so everyone sits
            the same thing.
          </DialogDescription>
        </DialogHeader>
        <AssessmentDetailsForm action={action} submitLabel="Create draft" />
      </DialogContent>
    </Dialog>
  );
}
