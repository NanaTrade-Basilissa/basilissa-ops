import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { can, requireAnyBranchPermission } from "@/lib/modules/identity/server";
import { listAnnouncements } from "@/lib/modules/announcements/server";
import { AnnouncementsTable } from "@/components/admin/announcements-table";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { PageHeader, PageShell } from "@/components/admin/page-shell";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Announcements" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ page?: string | string[] }>;

const PAGE_SIZE = 20;

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
    <PageShell>
      <PageHeader
        title="Announcements"
        description={`Broadcast updates and urgent banners to staff across branches. ${total} sent so far.`}
        actions={
          canSend ? (
            <Link
              href="/admin/announcements/new"
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "h-9 gap-1.5")}
            >
              <Plus className="size-4" />
              <span>New announcement</span>
            </Link>
          ) : undefined
        }
      />

      <AnnouncementsTable rows={rows} />

      <DataTablePagination
        page={page}
        totalPages={Math.max(1, pageCount)}
        total={total}
        pageSize={PAGE_SIZE}
        buildHref={(targetPage) => (targetPage <= 1 ? "/admin/announcements" : `/admin/announcements?page=${targetPage}`)}
      />
    </PageShell>
  );
}
