import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Standard outer container for every admin dashboard page.
 *
 * `app/admin/(dashboard)/layout.tsx` already owns the horizontal max-width
 * (`max-w-[1600px]`) and outer page padding, so pages must never add their
 * own outer `p-4`/`p-6`/`max-w-7xl` wrappers. `PageShell` enforces a single
 * vertical rhythm (`space-y-6`) across the entire dashboard.
 */
export function PageShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 max-w-full space-y-6", className)}>
      {children}
    </div>
  );
}

/**
 * Standard header block for every admin dashboard page.
 *
 * Enforces one typographic hierarchy (optical tight tracking on `h1`),
 * a predictable top-right slot for primary/secondary actions, an optional
 * back link for detail/sub-pages, and an optional bottom tab strip for
 * multi-view modules.
 */
export function PageHeader({
  title,
  description,
  badge,
  actions,
  backHref,
  backLabel,
  tabs,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  tabs?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("space-y-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          {backHref && (
            <Link
              href={backHref}
              className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="size-3.5" />
              <span>{backLabel ?? "Back"}</span>
            </Link>
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-heading text-2xl font-bold leading-tight tracking-[-0.02em] text-foreground">
              {title}
            </h1>
            {badge}
          </div>
          {description && (
            <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>

        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-0.5">
            {actions}
          </div>
        )}
      </div>

      {tabs && <div className="border-b border-border/70">{tabs}</div>}
    </header>
  );
}

export type PageTabItem = {
  href: string;
  label: string;
  active: boolean;
  badge?: React.ReactNode;
};

/**
 * Horizontal module tab strip meant for `PageHeader`'s `tabs` slot.
 * Uses route-based links so every view stays bookmarkable and shareable.
 */
export function PageTabs({
  items,
  ariaLabel = "Section navigation",
}: {
  items: PageTabItem[];
  ariaLabel?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className="no-scrollbar -mb-px flex items-center gap-1 overflow-x-auto"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3 pb-2.5 pt-1 text-sm font-medium transition-colors",
            item.active
              ? "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span>{item.label}</span>
          {item.badge}
        </Link>
      ))}
    </nav>
  );
}
