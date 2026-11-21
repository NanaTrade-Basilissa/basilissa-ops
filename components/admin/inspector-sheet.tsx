"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const SHEET_SIZES = {
  sm: "w-full max-w-none sm:max-w-none md:w-2/5 md:min-w-[420px]",
  md: "w-full max-w-none sm:max-w-none md:w-1/2 md:min-w-[480px]",
  lg: "w-full max-w-none sm:max-w-none md:w-3/5 md:min-w-[560px]",
} as const;

/**
 * Standardized right-hand record inspector & triage drawer.
 *
 * Replaces ad-hoc detail modals (`max-w-7xl` dialogs, inconsistent sheets)
 * with one predictable surface: symmetric enter/exit from the right,
 * sticky translucent header, scrollable body, optional "Open full page"
 * escape hatch, and optional sticky footer for primary actions.
 */
export function InspectorSheet({
  open,
  onOpenChange,
  title,
  description,
  badge,
  fullPageHref,
  fullPageLabel = "Open full page",
  size = "md",
  footer,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  fullPageHref?: string;
  fullPageLabel?: string;
  size?: keyof typeof SHEET_SIZES;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "w-full gap-0 p-0",
          SHEET_SIZES[size],
          className,
        )}
      >
        <SheetHeader className="sticky top-0 z-10 border-b border-border/70 bg-popover/90 px-5 py-4 pr-12 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <SheetTitle className="truncate font-heading text-base font-semibold tracking-tight">
                {title}
              </SheetTitle>
              {badge}
            </div>
            {fullPageHref && (
              <Link
                href={fullPageHref}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{fullPageLabel}</span>
                <ArrowUpRight className="size-3.5" />
              </Link>
            )}
          </div>
          {description && (
            <SheetDescription className="text-xs text-muted-foreground">
              {description}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>

        {footer && (
          <SheetFooter className="border-t border-border/70 bg-popover/90 px-5 py-3 backdrop-blur-md sm:flex-row sm:justify-end">
            {footer}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
