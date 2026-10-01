import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { can, requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { listAnnouncements } from "@/lib/modules/announcements/server";
import { AnnouncementsTable } from "@/components/admin/announcements-table";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Announcements" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ page?: string | string[] }>;

/**
 * What has been sent. Someone with a company-wide grant sees everything; a
 * branch-scoped manager sees what they sent themselves (see `queries.ts`).
 * Sending is a separate permission, re-checked by the compose page and the
 * action.
 */
export default async function AnnouncementsPage({ searchParams }: { searchParams: SearchParams }) {
  const { actor, scope } = await requireAnyBranchPermission("announcement:read");
  const canSend = can(actor, "announcement:write");

  const raw = await searchParams;
  const pageParam = Number(Array.isArray(raw.page) ? raw.page[0] : raw.page);
  const { rows, page, pageCount, total } = await listAnnouncements(
    { userId: actor.userId, scope },
    Number.isFinite(pageParam) ? pageParam : 1,
  );

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Announcements</h1>
          <p className="text-sm text-muted-foreground">
            Messages sent to staff. {total} sent so far.
          </p>
        </div>
        {canSend && (
          <Link href="/admin/announcements/new" className={cn(buttonVariants())}>
            <Plus className="size-4" />
            New announcement
          </Link>
        )}
      </div>

      <AnnouncementsTable rows={rows} />

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/admin/announcements?page=${page - 1}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                <ChevronLeft className="size-4" />
                Newer
              </Link>
            )}
            {page < pageCount && (
              <Link href={`/admin/announcements?page=${page + 1}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Older
                <ChevronRight className="size-4" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
