import { PageTabs, type PageTabItem } from "@/components/admin/page-shell";

export function FeedbackSectionTabs({
  active,
}: {
  active: "overview" | "submissions" | "questions";
}) {
  const items: PageTabItem[] = [
    { href: "/admin/feedback", label: "Overview", active: active === "overview" },
    { href: "/admin/feedback/all", label: "All Submissions", active: active === "submissions" },
    { href: "/admin/feedback/questions", label: "Questions", active: active === "questions" },
  ];

  return <PageTabs items={items} ariaLabel="Customer Feedback views" />;
}
