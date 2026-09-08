"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  MessageSquareText,
  ShieldCheck,
  Store,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
  feature?: "attendance";
};

type NavGroup = {
  label: string;
  items: readonly NavItem[];
};

// TODO(phase-3): filter this list by permission once every page's specific
// permission is known here. Hiding a link is presentation, not authorisation —
// the page and its Server Action both check independently.
const DASHBOARD_ITEM: NavItem = { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true };

/**
 * Grouped by purpose rather than left as one flat list, so the sidebar reads
 * as "what is this system made of" rather than growing sideways forever.
 * Adding a feature means adding one line to the group it belongs to, or a
 * new group — not renumbering anything.
 */
const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "People",
    items: [
      { href: "/admin/employees", label: "Employees", icon: Users, exact: false },
      { href: "/admin/branches", label: "Branches", icon: Store, exact: false },
      { href: "/admin/attendance", label: "Attendance", icon: ClipboardList, exact: true, feature: "attendance" },
      { href: "/admin/shifts", label: "Shifts", icon: CalendarRange, exact: false, feature: "attendance" },
      { href: "/admin/attendance/policy", label: "Attendance policy", icon: CalendarClock, exact: false, feature: "attendance" },
    ],
  },
  {
    // Its own section, deliberately, ahead of the operational features
    // below it: HR-owned people-development tools are a different concern
    // from day-to-day branch operations, and this is where the next one of
    // them lands.
    label: "HR",
    items: [{ href: "/admin/assessments", label: "Assessments", icon: ClipboardCheck, exact: false }],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/feedbacks", label: "Feedbacks", icon: MessageSquareText, exact: false },
      { href: "/admin/questions", label: "Questions", icon: ListChecks, exact: false },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/users", label: "Users", icon: UserCog, exact: false },
      { href: "/admin/security", label: "Security", icon: ShieldCheck, exact: false },
    ],
  },
] as const;

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-4" />
      {item.label}
    </Link>
  );
}

/**
 * `attendanceEnabled` arrives as a prop rather than being read here.
 *
 * This is a Client Component, and a flag readable in the browser would have to
 * be `NEXT_PUBLIC_`, which ships it to everyone and makes it look like a
 * client concern. The server already knows; it just tells us.
 */
export function AdminNav({ attendanceEnabled }: { attendanceEnabled: boolean }) {
  const pathname = usePathname();
  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname.startsWith(item.href));

  return (
    <nav className="flex flex-col gap-4" aria-label="Admin navigation">
      <NavLink item={DASHBOARD_ITEM} active={isActive(DASHBOARD_ITEM)} />

      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) => !item.feature || attendanceEnabled);
        if (items.length === 0) return null;

        return (
          <div key={group.label} className="flex flex-col gap-1">
            <h3 className="px-3 text-xs font-semibold tracking-wide text-sidebar-foreground/60 uppercase">
              {group.label}
            </h3>
            {items.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item)} />
            ))}
          </div>
        );
      })}
    </nav>
  );
}
