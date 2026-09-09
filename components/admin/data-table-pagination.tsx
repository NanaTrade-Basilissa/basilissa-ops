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
}: {
  page: number;
  totalPages: number;
  total: number;
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages} ({total} total)
      </p>
      <div className="flex gap-1.5">
        <Link
          href={buildHref(page - 1)}
          aria-disabled={page <= 1}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), page <= 1 && "pointer-events-none opacity-50")}
        >
          Previous
        </Link>
        <Link
          href={buildHref(page + 1)}
          aria-disabled={page >= totalPages}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            page >= totalPages && "pointer-events-none opacity-50",
          )}
        >
          Next
        </Link>
      </div>
    </div>
  );
}
