"use client";

import { useState } from "react";
import type { CreateUserState } from "@/lib/modules/identity/actions";
import { CreateUserForm } from "@/components/admin/create-user-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function UserDialog({
  action,
  emailConfigured,
  trigger,
}: {
  action: (prev: CreateUserState, formData: FormData) => Promise<CreateUserState>;
  emailConfigured: boolean;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  // Remounts the form for "Add another" so its useActionState starts clean.
  const [formKey, setFormKey] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setFormKey((k) => k + 1);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New user</DialogTitle>
          <DialogDescription>
            Creates an account and emails them a link to set their own password. You never
            see or set it yourself.
          </DialogDescription>
        </DialogHeader>
        <CreateUserForm
          key={formKey}
          action={action}
          emailConfigured={emailConfigured}
          onClose={() => setOpen(false)}
          onAddAnother={() => setFormKey((k) => k + 1)}
        />
      </DialogContent>
    </Dialog>
  );
}
