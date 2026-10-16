"use client";

import { useState } from "react";
import { QrCode, Printer, Download, Loader2 } from "lucide-react";
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

async function toDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function WallQrDialog({
  branchId,
  branchName,
  branchSlug,
  triggerClassName,
}: WallQrDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const qrEndpoint = `/api/admin/branches/${branchId}/meals/qr`;

  const handlePrint = async () => {
    try {
      setIsPrinting(true);
      const [logoDataUrl, qrDataUrl] = await Promise.all([
        toDataUrl("/bsa-logo.jpeg").catch(() => "/bsa-logo.jpeg"),
        toDataUrl(qrEndpoint).catch(() => qrEndpoint),
      ]);

      const printWindow = window.open("", "_blank");
      if (!printWindow) return;

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Basilissa Staff Meal Claim - ${branchName}</title>
            <style>
              @page { size: A4 portrait; margin: 15mm; }
              * { box-sizing: border-box; }
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
                padding: 24px;
                background: #ffffff;
              }
              .card {
                border: 3.5px solid #18181b;
                border-radius: 28px;
                padding: 40px 48px;
                max-width: 520px;
                width: 100%;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08);
                display: flex;
                flex-direction: column;
                align-items: center;
              }
              .logo {
                width: 84px;
                height: 84px;
                border-radius: 18px;
                object-fit: cover;
                margin-bottom: 16px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
              }
              .title {
                font-size: 26px;
                font-weight: 800;
                color: #18181b;
                margin-bottom: 4px;
                letter-spacing: -0.3px;
              }
              .branch {
                font-size: 16px;
                font-weight: 600;
                color: #52525b;
                margin-bottom: 20px;
              }
              .qr-wrapper {
                background: #f4f4f5;
                padding: 24px;
                border-radius: 20px;
                display: inline-block;
                margin: 4px 0 20px 0;
              }
              .qr-wrapper img {
                width: 270px;
                height: 270px;
                display: block;
              }
              .instructions {
                width: 100%;
                text-align: left;
                background: #fafafa;
                border: 1px solid #e4e4e7;
                padding: 16px 20px;
                border-radius: 14px;
                font-size: 14px;
                line-height: 1.6;
                color: #3f3f46;
              }
              .instructions ol {
                margin: 0;
                padding-left: 20px;
              }
              .instructions li {
                margin-bottom: 4px;
              }
              .instructions li:last-child {
                margin-bottom: 0;
              }
              .footer {
                margin-top: 24px;
                font-size: 12px;
                color: #a1a1aa;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 1px;
              }
            </style>
          </head>
          <body>
            <div class="card">
              <img src="${logoDataUrl}" alt="Basilissa Logo" class="logo" />
              <div class="title">Staff Meal Claim Station</div>
              <div class="branch">${branchName} Branch</div>
              <div class="qr-wrapper">
                <img src="${qrDataUrl}" alt="Scan to Claim Meal" />
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
    } catch (err) {
      console.error("Failed to print sign", err);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadPoster = async () => {
    try {
      setIsDownloading(true);
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 1600;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 1200, 1600);

      // Card border
      const cardX = 120;
      const cardY = 100;
      const cardW = 960;
      const cardH = 1400;
      const cardRadius = 36;

      ctx.save();
      ctx.strokeStyle = "#18181b";
      ctx.lineWidth = 7;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, cardRadius);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Load Logo
      const logoImg = new Image();
      logoImg.crossOrigin = "anonymous";
      await new Promise((resolve, reject) => {
        logoImg.onload = resolve;
        logoImg.onerror = reject;
        logoImg.src = "/bsa-logo.jpeg";
      });

      // Draw Logo (rounded)
      const logoSize = 140;
      const logoX = 600 - logoSize / 2;
      const logoY = 160;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(logoX, logoY, logoSize, logoSize, 28);
      ctx.clip();
      ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
      ctx.restore();

      // Title: Staff Meal Claim Station
      ctx.fillStyle = "#18181b";
      ctx.font = "bold 44px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Staff Meal Claim Station", 600, 360);

      // Branch
      ctx.fillStyle = "#52525b";
      ctx.font = "600 30px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText(`${branchName} Branch`, 600, 412);

      // QR wrapper box
      const qrBoxSize = 540;
      const qrBoxX = 600 - qrBoxSize / 2;
      const qrBoxY = 460;
      ctx.save();
      ctx.fillStyle = "#f4f4f5";
      ctx.beginPath();
      ctx.roundRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 28);
      ctx.fill();
      ctx.restore();

      // Load QR Code
      const qrImg = new Image();
      qrImg.crossOrigin = "anonymous";
      await new Promise((resolve, reject) => {
        qrImg.onload = resolve;
        qrImg.onerror = reject;
        qrImg.src = qrEndpoint;
      });
      const qrSize = 480;
      ctx.drawImage(qrImg, 600 - qrSize / 2, qrBoxY + 30, qrSize, qrSize);

      // Instructions container
      const instW = 760;
      const instH = 250;
      const instX = 600 - instW / 2;
      const instY = 1040;
      ctx.save();
      ctx.fillStyle = "#fafafa";
      ctx.strokeStyle = "#e4e4e7";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(instX, instY, instW, instH, 20);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Instructions Text
      ctx.textAlign = "left";
      const lineSpacing = 62;
      const startTextY = 1105;

      // Step 1
      ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "#18181b";
      ctx.fillText("1.", instX + 36, startTextY);
      ctx.font = "24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "#3f3f46";
      ctx.fillText("Open your ", instX + 68, startTextY);
      ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "#18181b";
      ctx.fillText("Basilissa Employee App", instX + 185, startTextY);

      // Step 2
      ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "#18181b";
      ctx.fillText("2.", instX + 36, startTextY + lineSpacing);
      ctx.font = "24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "#3f3f46";
      ctx.fillText("Tap ", instX + 68, startTextY + lineSpacing);
      ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "#18181b";
      ctx.fillText("Meals", instX + 115, startTextY + lineSpacing);
      ctx.font = "24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "#3f3f46";
      ctx.fillText(" and scan this wall code", instX + 185, startTextY + lineSpacing);

      // Step 3
      ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "#18181b";
      ctx.fillText("3.", instX + 36, startTextY + lineSpacing * 2);
      ctx.font = "24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "#3f3f46";
      ctx.fillText("Show the ", instX + 68, startTextY + lineSpacing * 2);
      ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "#16a34a";
      ctx.fillText("Green Pass", instX + 172, startTextY + lineSpacing * 2);
      ctx.font = "24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = "#3f3f46";
      ctx.fillText(" to kitchen staff", instX + 305, startTextY + lineSpacing * 2);

      // Footer
      ctx.textAlign = "center";
      ctx.fillStyle = "#a1a1aa";
      ctx.font = "600 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText("PERMANENT WALL SIGN • DO NOT REMOVE", 600, 1370);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `basilissa-staff-meal-sign-${branchSlug}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, "image/png");
    } catch (err) {
      console.error("Failed to generate poster download", err);
    } finally {
      setIsDownloading(false);
    }
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
            Kitchen Wall QR Code Sign
          </DialogTitle>
          <DialogDescription>
            Post this official sign at the kitchen serving station for staff meal collection.
          </DialogDescription>
        </DialogHeader>

        {/* Live Poster Card Preview */}
        <div className="flex flex-col items-center bg-white border-2 border-zinc-900 rounded-2xl p-5 shadow-xs text-center my-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/bsa-logo.jpeg"
            alt="Basilissa Logo"
            className="w-14 h-14 rounded-xl object-cover shadow-xs mb-2 border border-zinc-100"
          />
          <h3 className="font-bold text-base text-zinc-900 leading-tight">
            Staff Meal Claim Station
          </h3>
          <p className="text-xs font-medium text-zinc-500 mt-0.5 mb-3">
            {branchName} Branch
          </p>

          <div className="bg-zinc-100 p-3 rounded-xl mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrEndpoint}
              alt="Branch Wall QR"
              className="w-40 h-40 object-contain"
            />
          </div>

          <div className="bg-zinc-50 border border-zinc-200/80 rounded-lg p-2.5 text-left text-[11px] leading-relaxed text-zinc-700 w-full mb-3">
            <ol className="list-decimal pl-4 space-y-0.5">
              <li>Open <strong>Basilissa Employee App</strong></li>
              <li>Tap <strong>Meals</strong> and scan this wall code</li>
              <li>Show the <strong>Green Pass</strong> to kitchen staff</li>
            </ol>
          </div>

          <p className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400">
            Permanent Wall Sign • Do Not Remove
          </p>
        </div>

        {/* Actions Footer */}
        <div className="flex flex-col gap-2 pt-2">
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPoster}
              disabled={isDownloading}
              className="gap-1.5 text-xs"
            >
              {isDownloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Download Sign (PNG)
            </Button>
            <Button
              onClick={handlePrint}
              disabled={isPrinting}
              className="gap-2 text-xs"
              size="sm"
            >
              {isPrinting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              Print Sign
            </Button>
          </div>

          <div className="flex justify-end">
            <a
              href={`${qrEndpoint}?download=1`}
              download={`basilissa-meal-claim-${branchSlug}-qr.png`}
              className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Download QR code image only
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
