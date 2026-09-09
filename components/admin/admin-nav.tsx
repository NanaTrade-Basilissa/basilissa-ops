import {
  Brain,
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
import type { FeatureName } from "@/lib/platform/features";

/**
 * Navigation data only — no rendering here. The actual sidebar is
 * `components/app-sidebar.tsx` (shadcn's Sidebar primitives); this file
 * stays a plain data module so it can be read by both the sidebar and
 * `tests/features.test.ts`, which asserts every gated destination carries
 * its `feature` flag.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
  feature?: FeatureName;
};

export type NavGroup = {
  label: string;
  items: readonly NavItem[];
};

export const DASHBOARD_ITEM: NavItem = { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true };

// TODO(phase-3): filter this list by permission once every page's specific
// permission is known here. Hiding a link is presentation, not authorisation —
// the page and its Server Action both check independently.
/**
 * Grouped by purpose rather than left as one flat list, so the sidebar reads
 * as "what is this system made of" rather than growing sideways forever.
 * Adding a feature means adding one line to the group it belongs to, or a
 * new group — not renumbering anything.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
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
    items: [
      { href: "/admin/assessments", label: "Assessments", icon: ClipboardCheck, exact: false },
      { href: "/admin/aptitude-tests", label: "Aptitude Tests", icon: Brain, exact: false, feature: "aptitude" },
    ],
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
