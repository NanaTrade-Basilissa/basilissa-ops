"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { QuestionFormState } from "@/lib/modules/questions/actions";
import { QuestionForm } from "@/components/admin/question-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function QuestionDialog({
  action,
  defaultValues,
  submitLabel,
  activeCount,
  activeCap,
  title,
  description,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  action: (prevState: QuestionFormState, formData: FormData) => Promise<QuestionFormState>;
  defaultValues?: { text: string; isActive: boolean; ratingLabels?: string[] };
  submitLabel: string;
  activeCount: number;
  activeCap: number;
  title: string;
  description: string;
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <QuestionForm
          action={action}
          defaultValues={defaultValues}
          submitLabel={submitLabel}
          activeCount={activeCount}
          activeCap={activeCap}
          onSuccess={() => {
            setOpen(false);
            toast.success(defaultValues ? "Question updated successfully" : "Question created successfully");
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
