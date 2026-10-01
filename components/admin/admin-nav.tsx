import {
  BarChart3,
  Brain,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  History,
  Layers,
  LayoutDashboard,
  ListChecks,
  Mail,
  MessageSquareText,
  Shield,
  Store,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/modules/identity/authorization";

/**
 * Navigation data only, no rendering here. The actual sidebar is
 * `components/app-sidebar.tsx` (shadcn's Sidebar primitives); this file
 * stays a plain data module read by the sidebar.
 */

export type NavBadge = "pendingLeave";

export type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
  permission?: Permission;
  /** Key into the counts the layout passes to the sidebar, shown as a badge. */
  badge?: NavBadge;
};

/**
 * Related pages folded under one expandable entry. Has no page of its own and
 * no permission of its own: it is visible when any child is.
 */
export type NavFolder = {
  label: string;
  icon: LucideIcon;
  children: readonly Omit<NavLink, "icon">[];
};

export type NavItem = NavLink | NavFolder;

export type NavGroup = {
  label: string;
  items: readonly NavItem[];
};

export const isFolder = (item: NavItem): item is NavFolder => "children" in item;

/**
 * The navigation one person sees: links they hold the permission for, folders
 * with at least one such child, sections with anything left in them. Pure, so
 * the sidebar and the authorization tests share one definition.
 */
export function visibleNav(permissions: readonly string[], groups: readonly NavGroup[] = NAV_GROUPS): NavGroup[] {
  const allowed = (permission?: Permission) => !permission || permissions.includes(permission);
  return groups
    .map((group) => ({
      label: group.label,
      items: group.items.flatMap((item): NavItem[] => {
        if (!isFolder(item)) return allowed(item.permission) ? [item] : [];
        const children = item.children.filter((child) => allowed(child.permission));
        return children.length > 0 ? [{ ...item, children }] : [];
      }),
    }))
    .filter((group) => group.items.length > 0);
}

/** Every page href in a set of groups, folders opened up. */
export function navHrefs(groups: readonly NavGroup[]): string[] {
  return groups.flatMap((group) =>
    group.items.flatMap((item) => (isFolder(item) ? item.children.map((child) => child.href) : [item.href])),
  );
}

export const DASHBOARD_ITEM: NavLink = { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true };

// Navigation links are gated by permission so that users only see features
// they have full or partial access to. Server actions and pages enforce
// authorization independently.
/**
 * Grouped by purpose rather than left as one flat list, so the sidebar reads
 * as "what is this system made of" rather than growing sideways forever.
 * Adding a feature means adding one line to the group it belongs to, or a
 * new group, not renumbering anything.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "People",
    items: [
      { href: "/admin/employees", label: "Employees", icon: Users, exact: false, permission: "employee:read" },
      {
        label: "Branches",
        icon: Store,
        children: [
          { href: "/admin/branches", label: "Branches", exact: false, permission: "branch:read" },
          // The fingerprint terminals installed at each branch.
          { href: "/admin/devices", label: "Devices", exact: false, permission: "device:read" },
        ],
      },
      {
        label: "Attendance",
        icon: ClipboardList,
        children: [
          { href: "/admin/attendance", label: "Daily attendance", exact: true, permission: "attendance:read" },
          { href: "/admin/leave", label: "Leave", exact: false, permission: "attendance:read", badge: "pendingLeave" },
          { href: "/admin/attendance/policy", label: "Attendance policy", exact: false, permission: "policy:read" },
        ],
      },
      {
        // Who is expected at work: the rota, and the days nobody is. Rota
        // patterns land here too.
        label: "Scheduling",
        icon: CalendarRange,
        children: [
          { href: "/admin/shifts", label: "Shifts & rota", exact: false, permission: "schedule:read" },
          { href: "/admin/holidays", label: "Public holidays", exact: false, permission: "policy:read" },
        ],
      },
      { href: "/admin/payroll", label: "Payroll", icon: Wallet, exact: false, permission: "attendance:read" },
    ],
  },
  {
    // Its own section, deliberately, ahead of the operational features
    // below it: HR-owned people-development tools are a different concern
    // from day-to-day branch operations, and this is where the next one of
    // them lands.
    label: "HR",
    items: [
      { href: "/admin/assessments", label: "Assessments", icon: ClipboardCheck, exact: false, permission: "assessment:read" },
      { href: "/admin/aptitude-tests", label: "Aptitude Tests", icon: Brain, exact: false, permission: "aptitude:read" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/feedback", label: "Feedback Overview", icon: BarChart3, exact: true, permission: "feedback:read" },
      { href: "/admin/feedback/all", label: "All Submissions", icon: MessageSquareText, exact: false, permission: "feedback:read" },
      { href: "/admin/feedback/questions", label: "Questions", icon: ListChecks, exact: false, permission: "question:read" },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/users", label: "Users", icon: UserCog, exact: false, permission: "user:read" },
      { href: "/admin/roles", label: "Roles & Permissions", icon: Shield, exact: false, permission: "roles:read" },
      { href: "/admin/audit-trail", label: "Audit Trail", icon: History, exact: false, permission: "user:read" },
      { href: "/admin/jobs", label: "Background Jobs", icon: Layers, exact: false, permission: "jobs:read" },
      { href: "/admin/email-queue", label: "Email Queue", icon: Mail, exact: false, permission: "email_queue:read" },
    ],
  },
] as const;
