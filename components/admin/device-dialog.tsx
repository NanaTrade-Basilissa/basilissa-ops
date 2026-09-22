"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { DeviceFormState } from "@/lib/modules/devices/actions";
import { DeviceForm } from "@/components/admin/device-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DeviceDialog({
  action,
  branches,
  defaultValues,
  submitLabel,
  title,
  description,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  action: (prevState: DeviceFormState, formData: FormData) => Promise<DeviceFormState>;
  branches: { id: string; name: string }[];
  defaultValues?: React.ComponentProps<typeof DeviceForm>["defaultValues"];
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
        <DeviceForm
          action={action}
          branches={branches}
          defaultValues={defaultValues}
          submitLabel={submitLabel}
          onSuccess={() => {
            setOpen(false);
            toast.success(defaultValues ? "Device updated successfully" : "Device registered successfully");
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
