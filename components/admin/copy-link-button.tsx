"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Feedback link copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the link - copy it manually instead");
    }
  }

  return (
    <div className="w-full space-y-1.5">
      <p className="truncate rounded-md border border-border bg-muted px-2.5 py-1.5 font-mono text-xs text-muted-foreground" title={url}>
        {url}
      </p>
      <Button type="button" variant="outline" size="sm" className="w-full" onClick={handleCopy}>
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}
