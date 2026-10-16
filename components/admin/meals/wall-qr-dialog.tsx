"use client";

import { useState } from "react";
import { QrCode, Printer, Download, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";

import { cn } from "@/lib/utils";

interface WallQrDialogProps {
  branchId: string;
  branchName: string;
  branchSlug: string;
  triggerClassName?: string;
}

export function WallQrDialog({
  branchId,
  branchName,
  branchSlug,
  triggerClassName,
}: WallQrDialogProps) {
  const [open, setOpen] = useState(false);
  const qrEndpoint = `/api/admin/branches/${branchId}/meals/qr`;

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Basilissa Staff Meal Claim - ${branchName}</title>
          <style>
            @page { size: A4 portrait; margin: 15mm; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 90vh;
              text-align: center;
              color: #18181b;
              margin: 0;
              padding: 20px;
            }
            .card {
              border: 3px solid #18181b;
              border-radius: 24px;
              padding: 48px;
              max-width: 520px;
              box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
            }
            .brand {
              font-size: 28px;
              font-weight: 800;
              letter-spacing: 2px;
              text-transform: uppercase;
              color: #e11d48;
              margin-bottom: 8px;
            }
            .title {
              font-size: 24px;
              font-weight: 700;
              margin-bottom: 4px;
            }
            .branch {
              font-size: 16px;
              font-weight: 600;
              color: #52525b;
              margin-bottom: 24px;
            }
            .qr-wrapper {
              background: #f4f4f5;
              padding: 24px;
              border-radius: 16px;
              display: inline-block;
              margin: 16px 0;
            }
            .qr-wrapper img {
              width: 280px;
              height: 280px;
              display: block;
            }
            .instructions {
              margin-top: 24px;
              text-align: left;
              background: #fafafa;
              padding: 16px 20px;
              border-radius: 12px;
              font-size: 14px;
              line-height: 1.6;
              color: #3f3f46;
            }
            .instructions ol {
              margin: 0;
              padding-left: 20px;
            }
            .footer {
              margin-top: 24px;
              font-size: 12px;
              color: #a1a1aa;
              font-weight: 500;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="brand">BASILISSA</div>
            <div class="title">Staff Meal Claim Station</div>
            <div class="branch">${branchName} Branch</div>
            <div class="qr-wrapper">
              <img src="${qrEndpoint}" alt="Scan to Claim Meal" />
            </div>
            <div class="instructions">
              <ol>
                <li>Open your <strong>Basilissa Employee App</strong></li>
                <li>Tap <strong>Meals</strong> and scan this wall code</li>
                <li>Show the <strong>Green Pass</strong> to kitchen staff</li>
              </ol>
            </div>
            <div class="footer">Permanent Wall Sign &bull; Do Not Remove</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className={cn("gap-1.5 shrink-0 whitespace-nowrap", triggerClassName)}>
            <QrCode className="h-4 w-4 shrink-0" />
            <span className="sm:hidden">Print QR</span>
            <span className="hidden sm:inline">Print Wall QR</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            Permanent Wall QR Code
          </DialogTitle>
          <DialogDescription>
            Post this sign at the kitchen serving counter. Staff scan it once when collecting their meal.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center p-6 bg-muted/40 rounded-xl border border-dashed text-center">
          <div className="bg-white p-4 rounded-xl shadow-xs border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrEndpoint}
              alt="Branch Wall QR"
              className="w-48 h-48 object-contain"
            />
          </div>
          <p className="mt-3 text-sm font-semibold text-foreground">
            {branchName} ({branchSlug})
          </p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Encodes: <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">basilissa://meals/claim?branch={branchSlug}</code>
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <a
            href={`${qrEndpoint}?download=1`}
            download={`basilissa-meal-claim-${branchSlug}.png`}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border hover:bg-muted text-muted-foreground transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Download PNG
          </a>
          <Button onClick={handlePrint} className="gap-2" size="sm">
            <Printer className="h-4 w-4" />
            Print Sign
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
