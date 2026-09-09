import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Real `<Link>`s to `?page=N`, not `table.nextPage()` — pagination state
 * lives in the URL and the server re-queries on navigation, the same as
 * before this was extracted. There is nothing here for TanStack Table to
 * own: the whole dataset never reaches the client, only the current page.
 */
export function DataTablePagination({
  page,
  totalPages,
  total,
  buildHref,
  pageSize,
  buildPageSizeHref,
  pageSizeOptions = [10, 20, 50],
  alwaysShow = false,
}: {
  page: number;
  totalPages: number;
  total: number;
  buildHref: (page: number) => string;
  pageSize?: number;
  buildPageSizeHref?: (size: number) => string;
  pageSizeOptions?: readonly number[];
  alwaysShow?: boolean;
}) {
  if (!alwaysShow && totalPages <= 1 && !buildPageSizeHref) return null;

  const start = total === 0 ? 0 : (page - 1) * (pageSize ?? 0) + 1;
  const end = pageSize ? Math.min(total, page * pageSize) : total;

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

        {buildPageSizeHref && (
          <div className="flex items-center gap-1.5 border-l border-border pl-3">
            <span>Rows:</span>
            {pageSizeOptions.map((size) => {
              const active = pageSize === size;
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
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          Page {page} of {Math.max(1, totalPages)}
        </span>
        <div className="flex gap-1.5">
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
        </div>
      </div>
    </div>
  );
}
