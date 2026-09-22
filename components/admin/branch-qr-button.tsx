"use client";

import * as React from "react";
import { Download, QrCode } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CopyLinkButton } from "@/components/admin/copy-link-button";
import { cn } from "@/lib/utils";

export interface BranchQrDialogProps {
  branchId: string;
  branchName: string;
  feedbackUrl: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

export function BranchQrDialog({
  branchId,
  branchName,
  feedbackUrl,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  trigger,
}: BranchQrDialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setInternalOpen;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== null && (
        <DialogTrigger
          render={
            (trigger as React.ReactElement) || (
              <Button type="button" variant="outline" size="sm" className="gap-1.5">
                <QrCode className="size-4" />
                <span className="hidden sm:inline">Feedback QR code</span>
              </Button>
            )
          }
        />
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{branchName} feedback QR code</DialogTitle>
          <DialogDescription>
            Customers scanning this QR code will submit feedback directly for this branch.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="overflow-hidden rounded-xl border border-border p-2 bg-white shadow-xs">
            {/* eslint-disable-next-line @next/next/no-img-element -- dynamically generated PNG, not a static asset next/image can optimize */}
            <img
              src={`/api/admin/branches/${branchId}/feedback/qr`}
              alt={`QR code for ${branchName}`}
              width={200}
              height={200}
              className="size-48 object-contain"
            />
          </div>
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            Direct feedback URL:
          </p>
          <CopyLinkButton url={feedbackUrl} />
          <a
            href={`/api/admin/branches/${branchId}/feedback/qr?download=1`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full gap-1.5")}
          >
            <Download className="size-4" /> Download QR PNG
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const BranchQrButton = BranchQrDialog;
