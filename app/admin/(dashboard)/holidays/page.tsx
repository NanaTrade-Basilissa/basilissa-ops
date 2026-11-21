import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { can, requirePermission } from "@/lib/modules/identity/server";
import { listPublicHolidays } from "@/lib/modules/attendance/server";
import { HolidaysTable } from "@/components/admin/holidays-table";
import { HolidayTopActions } from "@/components/admin/holiday-top-actions";
import { PageHeader, PageShell } from "@/components/admin/page-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Public holidays" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ year?: string | string[] }>;

/**
 * Public holidays for every branch. The same permission as attendance policy:
 * holidays decide who is scheduled, which is a policy question. The Server
 * Actions re-check `policy:write` themselves.
 */
export default async function HolidaysPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePermission("policy:read");
  const canEdit = can(actor, "policy:write");

  const raw = await searchParams;
  const yearParam = Number(Array.isArray(raw.year) ? raw.year[0] : raw.year);
  const currentYear = new Date().getFullYear();
  const year = Number.isInteger(yearParam) && yearParam >= 2020 && yearParam <= 2100 ? yearParam : currentYear;

  const holidays = await listPublicHolidays(year);
  const estimated = holidays.filter((h) => !h.confirmed).length;

  return (
    <PageShell>
      <PageHeader
        title="Public Holidays"
        description="Manage national and company-observed holidays that affect office-hour shift schedules."
        actions={canEdit ? <HolidayTopActions year={year} /> : undefined}
      />

      <div className="flex items-center justify-between gap-3 rounded-xl bg-card px-3 py-2 ring-1 ring-foreground/10">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Calendar Year
        </span>
        <div className="flex items-center gap-1">
          <Link
            href={`/admin/holidays?year=${year - 1}`}
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
            aria-label={`${year - 1}`}
          >
            <ChevronLeft className="size-4" />
          </Link>
          <span className="min-w-14 text-center text-sm font-semibold tabular-nums">{year}</span>
          <Link
            href={`/admin/holidays?year=${year + 1}`}
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
            aria-label={`${year + 1}`}
          >
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>

      <Alert>
        <Info className="size-4" />
        <AlertTitle>How holidays affect schedules</AlertTitle>
        <AlertDescription>
          Staff whose shift is set to &ldquo;off on public holidays&rdquo; (office hours) are off and not marked
          absent. Branch rotas keep running. Anyone given a shift for the day, including a cover shift at
          another branch, works as rostered.
        </AlertDescription>
      </Alert>

      {estimated > 0 && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <AlertTitle>
            {estimated} estimated date{estimated === 1 ? "" : "s"}
          </AlertTitle>
          <AlertDescription className="text-amber-900/80 dark:text-amber-200/80">
            Eid dates follow the government&apos;s announcement and can move by a day. Edit and confirm them
            once announced. Estimated holidays still apply in the meantime.
          </AlertDescription>
        </Alert>
      )}

      <HolidaysTable holidays={holidays} canEdit={canEdit} />

      <p className="text-xs text-muted-foreground">
        The Ghana calendar does not include Republic Day (1 July). Add it by hand if it is observed.
      </p>
    </PageShell>
  );
}
