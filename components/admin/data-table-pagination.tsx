import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Dual-mode pagination component:
 * 1. Server-side URL mode via `buildHref` (real `<Link>`s to `?page=N`)
 * 2. Client-side state mode via `onPageChange` (interactive `<Button>`s)
 * Both render with the identical visual design, spacing, and sizing across all pages.
 */
export function DataTablePagination({
  page: rawPage,
  totalPages: rawTotalPages,
  total: rawTotal,
  totalItems: rawTotalItems,
  buildHref,
  onPageChange,
  pageSize: rawPageSize,
  buildPageSizeHref,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  alwaysShow = false,
}: {
  page: number;
  totalPages: number;
  total?: number;
  totalItems?: number;
  buildHref?: (page: number) => string;
  onPageChange?: (page: number) => void;
  pageSize?: number;
  buildPageSizeHref?: (size: number) => string;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: readonly number[];
  alwaysShow?: boolean;
}) {
  const page = Number.isFinite(Number(rawPage)) ? Number(rawPage) : 1;
  const total = Number.isFinite(Number(rawTotal ?? rawTotalItems))
    ? Number(rawTotal ?? rawTotalItems)
    : 0;
  const totalPages = Number.isFinite(Number(rawTotalPages))
    ? Math.max(1, Number(rawTotalPages))
    : 1;
  const pageSize =
    rawPageSize !== undefined && Number.isFinite(Number(rawPageSize))
      ? Number(rawPageSize)
      : undefined;

  const hasPageSizeSelector = Boolean(buildPageSizeHref || onPageSizeChange);
  if (!alwaysShow && totalPages <= 1 && !hasPageSizeSelector) return null;

  const safePageSize = pageSize ?? 0;
  const start = total === 0 ? 0 : Math.max(1, (page - 1) * safePageSize + 1);
  const end = pageSize ? Math.min(total, Math.max(0, page * pageSize)) : total;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {pageSize ? (
          <span>
            Showing <strong className="text-foreground">{start}</strong> to{" "}
            <strong className="text-foreground">{end}</strong> of{" "}
            <strong className="text-foreground">{total}</strong>
          </span>
        ) : (
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
        )}

        {hasPageSizeSelector && (
          <div className="flex items-center gap-1.5 border-l border-border pl-3">
            <span>Rows:</span>
            {pageSizeOptions.map((size) => {
              const active = pageSize === size;
              if (buildPageSizeHref) {
                return (
                  <Link
                    key={size}
                    href={buildPageSizeHref(size)}
                    className={cn(
                      "rounded px-2 py-0.5 text-xs transition-colors",
                      active
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {size}
                  </Link>
                );
              }

              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => onPageSizeChange?.(size)}
                  className={cn(
                    "cursor-pointer rounded px-2 py-0.5 text-xs transition-colors",
                    active
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {size}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          Page {page} of {Math.max(1, totalPages)}
        </span>
        <div className="flex gap-1.5">
          {buildHref ? (
            <>
              <Link
                href={buildHref(page - 1)}
                aria-disabled={page <= 1}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-8 text-xs",
                  page <= 1 && "pointer-events-none opacity-50",
                )}
              >
                Previous
              </Link>
              <Link
                href={buildHref(page + 1)}
                aria-disabled={page >= totalPages}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-8 text-xs",
                  page >= totalPages && "pointer-events-none opacity-50",
                )}
              >
                Next
              </Link>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => onPageChange?.(page - 1)}
                className="h-8 text-xs"
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => onPageChange?.(page + 1)}
                className="h-8 text-xs"
              >
                Next
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
