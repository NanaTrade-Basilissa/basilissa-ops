"use client";

import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/** Matches the search box's own `sm:w-64` so the JS layout switch and the CSS one flip at the same width. */
const FILTER_BAR_BREAKPOINT = 640;

/**
 * The search/filters/actions toolbar list pages use. At `sm` and above this
 * renders the same inline row every page already had — desktop is
 * pixel-identical to before. Below `sm`, secondary filters (selects, date
 * ranges, the Reset button) collapse into a bottom sheet behind a "Filters"
 * button so the row never crowds; the search box and primary actions stay
 * on the toolbar itself.
 *
 * `filters` keeps owning its own Reset button (each caller already has one,
 * styled as a subtle `outline` button) rather than this component inventing
 * a second one — Reset just moves into the sheet along with the rest.
 */
export function FilterBar({
  search,
  filters,
  actions,
  hasActiveFilters = false,
  filtersLabel = "Filters",
  className,
}: {
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  hasActiveFilters?: boolean;
  filtersLabel?: string;
  className?: string;
}) {
  const isMobile = useIsMobile(FILTER_BAR_BREAKPOINT);
  const [open, setOpen] = useState(false);

  if (isMobile && filters) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {search && <div className="min-w-0 flex-1">{search}</div>}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="relative h-9 shrink-0 gap-1.5 text-xs"
              >
                <SlidersHorizontal className="size-3.5" />
                {filtersLabel}
                {hasActiveFilters && (
                  <span
                    aria-hidden
                    className="absolute -top-1 -right-1 size-2 rounded-full bg-primary"
                  />
                )}
              </Button>
            }
          />
          <SheetContent side="bottom" className="max-h-[85vh]">
            <SheetHeader>
              <SheetTitle>{filtersLabel}</SheetTitle>
            </SheetHeader>
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-4">
              {filters}
            </div>
          </SheetContent>
        </Sheet>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
        {search}
        {filters}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
