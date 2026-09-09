import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

/**
 * Adapted from dashboard-01's SiteHeader: dropped the hardcoded page title
 * (this app's pages already render their own heading in `<main>`, and there
 * is no per-route title map to draw one from yet — a breadcrumb here is a
 * good next step once that exists).
 */
export function SiteHeader() {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 h-4 data-vertical:self-auto" />
      </div>
    </header>
  );
}
