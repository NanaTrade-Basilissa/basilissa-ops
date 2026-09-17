import {
  BarChart3,
  Brain,
  CalendarClock,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  Mail,
  MessageSquareText,
  Shield,
  ShieldCheck,
  Store,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/modules/identity/authorization";

/**
 * Navigation data only, no rendering here. The actual sidebar is
 * `components/app-sidebar.tsx` (shadcn's Sidebar primitives); this file
 * stays a plain data module read by the sidebar.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
  permission?: Permission;
};

export type NavGroup = {
  label: string;
  items: readonly NavItem[];
};

export const DASHBOARD_ITEM: NavItem = { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true };

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
      { href: "/admin/branches", label: "Branches", icon: Store, exact: false, permission: "branch:read" },
      { href: "/admin/attendance", label: "Attendance", icon: ClipboardList, exact: true, permission: "attendance:read" },
      { href: "/admin/shifts", label: "Shifts", icon: CalendarRange, exact: false, permission: "schedule:read" },
      { href: "/admin/attendance/policy", label: "Attendance policy", icon: CalendarClock, exact: false, permission: "policy:read" },
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
      { href: "/admin/security", label: "Security", icon: ShieldCheck, exact: false, permission: "user:read" },
      { href: "/admin/email-queue", label: "Email Queue", icon: Mail, exact: false, permission: "email_queue:read" },
    ],
  },
] as const;
