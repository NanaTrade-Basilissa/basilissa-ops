"use client";

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

export function GeneralQrButton({ feedbackUrl }: { feedbackUrl: string }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <QrCode className="size-4" /> Feedback QR code
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>General feedback QR code</DialogTitle>
          <DialogDescription>Not tied to a branch. This will send customers to the general feedback page.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          <div className="overflow-hidden rounded-lg border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- dynamically generated PNG, not a static asset next/image can optimize */}
            <img src="/api/admin/qr" alt="QR code for general feedback link" width={200} height={200} />
          </div>
          <CopyLinkButton url={feedbackUrl} />
          <a
            href="/api/admin/qr?download=1"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")}
          >
            <Download className="size-4" /> Download QR PNG
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
