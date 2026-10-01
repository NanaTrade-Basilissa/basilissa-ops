"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import {
  DASHBOARD_ITEM,
  isFolder,
  visibleNav,
  type NavBadge,
  type NavFolder,
  type NavLink,
} from "@/components/admin/admin-nav";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { NavUser } from "@/components/nav-user";
import { Logo } from "@/components/brand/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

type Badges = Partial<Record<NavBadge, number>>;

const BADGE_CLASS = "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";

function CountBadge({ count, className = "" }: { count: number; className?: string }) {
  return (
    <span
      className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums ${BADGE_CLASS} ${className}`}
    >
      {count}
    </span>
  );
}

/**
 * Related pages under one expandable entry. Opens itself on any of its pages,
 * so you never land somewhere with its section shut. While closed it carries
 * its children's counts, so a pending leave request is not hidden by folding
 * Attendance away. In the icon-only sidebar there is nowhere to unfold into,
 * so the icon goes straight to the first page.
 */
function NavFolderItem({
  item,
  isActive,
  badges,
}: {
  item: NavFolder;
  isActive: (link: Pick<NavLink, "href" | "exact">) => boolean;
  badges: Badges;
}) {
  const { state, isMobile } = useSidebar();
  const activeChild = item.children.some(isActive);
  const [open, setOpen] = React.useState(activeChild);

  // Navigating into the folder from elsewhere opens it. Adjusted during render
  // rather than in an effect, React's pattern for state that follows a prop.
  const [wasActive, setWasActive] = React.useState(activeChild);
  if (activeChild !== wasActive) {
    setWasActive(activeChild);
    if (activeChild) setOpen(true);
  }

  const total = item.children.reduce((sum, child) => sum + (child.badge ? (badges[child.badge] ?? 0) : 0), 0);

  if (state === "collapsed" && !isMobile) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={item.label}
          isActive={activeChild}
          render={<Link href={item.children[0]!.href} />}
        >
          <item.icon />
          <span>{item.label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group/collapsible" render={<SidebarMenuItem />}>
      <CollapsibleTrigger render={<SidebarMenuButton tooltip={item.label} isActive={activeChild && !open} />}>
        <item.icon />
        <span>{item.label}</span>
        {!open && total > 0 && <CountBadge count={total} className="ml-auto" />}
        {/* shadcn's sidebar-07 pattern: the collapsible's own open state turns it. */}
        <ChevronRight
          className={`${!open && total > 0 ? "" : "ml-auto"} transition-transform duration-200 group-data-open/collapsible:rotate-90`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>
          {item.children.map((child) => {
            const count = child.badge ? (badges[child.badge] ?? 0) : 0;
            return (
              <SidebarMenuSubItem key={child.href}>
                <SidebarMenuSubButton isActive={isActive(child)} render={<Link href={child.href} />}>
                  <span className="min-w-0 flex-1 truncate">{child.label}</span>
                  {count > 0 && <CountBadge count={count} />}
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            );
          })}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * The real admin sidebar, built on shadcn's Sidebar primitives
 * (`npx shadcn@latest add dashboard-01`) instead of the hand-rolled version
 * this replaced. Navigation data lives in `admin-nav.tsx`; this file is only
 * the shell: same routes and grouping.
 */
export function AppSidebar({
  user,
  permissions = [],
  badges = {},
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; email: string };
  permissions?: string[];
  badges?: Badges;
}) {
  const pathname = usePathname();
  const isActive = (link: Pick<NavLink, "href" | "exact">) =>
    link.exact ? pathname === link.href : pathname.startsWith(link.href);

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="data-[slot=sidebar-menu-button]:p-1.5!" render={<Link href="/admin" />}>
              <Logo showWordmark={false} size="sm" className="shrink-0" />
              <span className="text-base font-semibold">Basilissa</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={DASHBOARD_ITEM.label}
                  isActive={isActive(DASHBOARD_ITEM)}
                  render={<Link href={DASHBOARD_ITEM.href} />}
                >
                  <DASHBOARD_ITEM.icon />
                  <span>{DASHBOARD_ITEM.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleNav(permissions).map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) =>
                  isFolder(item) ? (
                    <NavFolderItem key={item.label} item={item} isActive={isActive} badges={badges} />
                  ) : (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton tooltip={item.label} isActive={isActive(item)} render={<Link href={item.href} />}>
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {item.badge && (badges[item.badge] ?? 0) > 0 && (
                        <SidebarMenuBadge className={BADGE_CLASS}>{badges[item.badge]}</SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  ),
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
