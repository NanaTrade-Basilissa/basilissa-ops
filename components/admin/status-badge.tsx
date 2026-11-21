import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex h-5.5 w-fit shrink-0 items-center justify-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors [&>svg]:size-3 [&>svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral:
          "border-border bg-muted/60 text-muted-foreground",
        good:
          "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        warning:
          "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
        critical:
          "border-destructive/30 bg-destructive/10 text-destructive",
        info:
          "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300",
        brand:
          "border-primary/40 bg-primary/15 text-foreground dark:bg-primary/20 dark:text-primary",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

/**
 * Semantic status pill that adapts cleanly across light and dark mode.
 * Use instead of ad-hoc Tailwind color utility chains (`bg-emerald-50`,
 * `bg-amber-500/10`, etc.) so status states read identically everywhere.
 */
export function StatusBadge({
  tone = "neutral",
  dot: _dot = false,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof statusBadgeVariants> & {
    /** @deprecated Dots are omitted globally for cleaner enterprise pills. */
    dot?: boolean;
  }) {
  void _dot;
  const resolvedTone = tone ?? "neutral";
  return (
    <span
      data-slot="status-badge"
      data-tone={resolvedTone}
      className={cn(statusBadgeVariants({ tone: resolvedTone }), className)}
      {...props}
    >
      {children}
    </span>
  );
}
