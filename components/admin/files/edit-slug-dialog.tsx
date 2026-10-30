"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Globe, Check, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkSlugAvailabilityAction, updateFileSlugAction } from "@/lib/modules/files/actions";
import type { HostedFileItem } from "@/lib/modules/files/constants";
import { SLUG_REGEX } from "@/lib/modules/files/validation";

interface EditSlugDialogProps {
  file: HostedFileItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (updatedFile: HostedFileItem) => void;
}

export function EditSlugDialog({
  file,
  open,
  onOpenChange,
  onSuccess,
}: EditSlugDialogProps) {
  const [slug, setSlug] = useState(file?.slug || "");
  const [checking, setChecking] = useState(false);
  const [availabilityMessage, setAvailabilityMessage] = useState<{
    valid: boolean;
    text: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Reset slug state when file changes
  const currentSlug = file?.slug || "";

  const handleSlugChange = (val: string) => {
    const sanitized = val.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-");
    setSlug(sanitized);
    setAvailabilityMessage(null);
  };

  const verifySlugAvailability = async () => {
    const trimmed = slug.trim();
    if (!trimmed) {
      setAvailabilityMessage({ valid: false, text: "Slug cannot be empty." });
      return;
    }
    if (!SLUG_REGEX.test(trimmed)) {
      setAvailabilityMessage({
        valid: false,
        text: "Slug must be 3-64 lowercase letters, numbers, or hyphens without leading/trailing hyphens.",
      });
      return;
    }

    setChecking(true);
    try {
      const res = await checkSlugAvailabilityAction(trimmed, file?.id);
      if (res.available) {
        setAvailabilityMessage({ valid: true, text: "Slug is available!" });
      } else {
        setAvailabilityMessage({ valid: false, text: res.reason || "Slug is unavailable." });
      }
    } catch {
      setAvailabilityMessage({ valid: false, text: "Failed to verify slug availability." });
    } finally {
      setChecking(false);
    }
  };

  const handleSave = () => {
    if (!file) return;
    const trimmed = slug.trim();
    if (!trimmed) {
      toast.error("Slug cannot be empty");
      return;
    }

    startTransition(async () => {
      const res = await updateFileSlugAction({
        fileId: file.id,
        slug: trimmed,
      });

      if (res.success) {
        toast.success("Public URL slug updated successfully");
        onSuccess(res.data);
        onOpenChange(false);
      } else {
        toast.error(res.error || "Failed to update slug");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-amber-500" />
            Edit Public Vanity Slug
          </DialogTitle>
          <DialogDescription>
            Customize the public URL path for this file. Vanity links are reachable at{" "}
            <span className="font-mono text-xs font-semibold">/view/:slug</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="slug-input" className="text-xs font-semibold">
              Vanity Path
            </Label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground select-none">
                  /view/
                </span>
                <Input
                  id="slug-input"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="company-policy-2026"
                  className="pl-16 font-mono text-xs"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={verifySlugAvailability}
                disabled={checking || !slug || slug === currentSlug}
                className="shrink-0 text-xs"
              >
                {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Check"}
              </Button>
            </div>
            {availabilityMessage && (
              <p
                className={`flex items-center gap-1.5 text-xs ${
                  availabilityMessage.valid ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                }`}
              >
                {availabilityMessage.valid ? (
                  <Check className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                )}
                {availabilityMessage.text}
              </p>
            )}
          </div>

          <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">Slug Rules:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Use lowercase letters, numbers, and hyphens (3-64 characters).</li>
              <li>Cannot begin or end with a hyphen.</li>
              <li>System keywords (admin, api, auth, etc.) are reserved.</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isPending || checking || !slug || slug === currentSlug}
            className="gap-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Slug
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
