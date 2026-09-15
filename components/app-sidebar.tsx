"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DASHBOARD_ITEM, NAV_GROUPS, type NavItem } from "@/components/admin/admin-nav";
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

/**
 * The real admin sidebar, built on shadcn's Sidebar primitives
 * (`npx shadcn@latest add dashboard-01`) instead of the hand-rolled version
 * this replaced. Navigation data lives in `admin-nav.tsx`; this file is only
 * the shell: same routes and grouping.
 */
export function AppSidebar({
  user,
  permissions = [],
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; email: string };
  permissions?: string[];
}) {
  const pathname = usePathname();
  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname.startsWith(item.href));

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

        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => {
            if (item.permission && !permissions.includes(item.permission)) return false;
            return true;
          });
          if (items.length === 0) return null;

          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton tooltip={item.label} isActive={isActive(item)} render={<Link href={item.href} />}>
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
