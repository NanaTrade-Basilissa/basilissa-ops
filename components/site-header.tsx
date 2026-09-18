"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Code2 } from "lucide-react";

const ROUTE_LABELS: Record<string, string> = {
  admin: "Dashboard",
  employees: "Employees",
  branches: "Branches",
  attendance: "Attendance",
  shifts: "Shifts",
  policy: "Attendance Policy",
  assessments: "Assessments",
  "aptitude-tests": "Aptitude Tests",
  feedback: "Customer Feedbacks",
  feedbacks: "Customer Feedbacks",
  questions: "Feedback Questions",
  users: "Users",
  security: "Security",
  settings: "Settings",
  "audit-trail": "Audit Trail",
  roles: "Roles & Permissions",
  jobs: "Background Jobs",
  "email-queue": "Email Queue",
  import: "Import",
  all: "Submissions",
  responses: "Responses",
  attempts: "Attempts",
  edit: "Edit",
};

export function SiteHeader() {
  const pathname = usePathname();

  const segments = pathname.split("/").filter(Boolean);
  // Remove "admin" from the middle, since /admin is the root dashboard
  const adminIndex = segments.indexOf("admin");
  const relevantSegments = adminIndex !== -1 ? segments.slice(adminIndex) : segments;

  const crumbs = relevantSegments.map((seg, idx) => {
    const href = "/" + relevantSegments.slice(0, idx + 1).join("/");
    const isLast = idx === relevantSegments.length - 1;
    let label = ROUTE_LABELS[seg];
    if (!label) {
      // Dynamic route segment (ID or token)
      label = "Details";
    }
    return { href, label, isLast };
  });

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border/50 bg-card/90 backdrop-blur transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center justify-between px-4 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4 data-vertical:self-auto" />
          <Breadcrumb className="min-w-0">
            <BreadcrumbList>
              {crumbs.length <= 1 ? (
                <BreadcrumbItem>
                  <BreadcrumbPage>Dashboard</BreadcrumbPage>
                </BreadcrumbItem>
              ) : (
                <>
                  {/* Full trail from `sm` up. Below that, everything but the
                      current page collapses into a single ellipsis so the
                      current page never wraps onto its own row. */}
                  {crumbs.slice(0, -1).map((crumb, idx) => (
                    <React.Fragment key={crumb.href}>
                      {idx > 0 && <BreadcrumbSeparator className="hidden sm:flex" />}
                      <BreadcrumbItem className="hidden sm:inline-flex">
                        <BreadcrumbLink render={<Link href={crumb.href} />}>
                          {crumb.label}
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                    </React.Fragment>
                  ))}

                  <BreadcrumbItem className="sm:hidden">
                    <BreadcrumbEllipsis />
                  </BreadcrumbItem>

                  <BreadcrumbSeparator />

                  <BreadcrumbItem className="min-w-0">
                    <BreadcrumbPage className="block min-w-0 truncate">
                      {crumbs[crumbs.length - 1].label}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/docs"
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            title="Open Swagger API Documentation"
          >
            <Code2 className="size-3.5" />
            <span className="hidden sm:inline">API Docs</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

