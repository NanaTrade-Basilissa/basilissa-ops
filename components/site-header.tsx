"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const ROUTE_LABELS: Record<string, string> = {
  admin: "Dashboard",
  employees: "Employees",
  branches: "Branches",
  attendance: "Attendance",
  shifts: "Shifts",
  policy: "Attendance Policy",
  assessments: "Assessments",
  "aptitude-tests": "Aptitude Tests",
  feedbacks: "Feedbacks",
  questions: "Questions",
  users: "Users",
  security: "Security",
  "email-queue": "Email Queue",
  import: "Import",
  all: "All",
  responses: "Responses",
  attempts: "Attempts",
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
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4 data-vertical:self-auto" />
          <Breadcrumb>
            <BreadcrumbList>
              {crumbs.length <= 1 ? (
                <BreadcrumbItem>
                  <BreadcrumbPage>Dashboard</BreadcrumbPage>
                </BreadcrumbItem>
              ) : (
                crumbs.map((crumb, idx) => (
                  <React.Fragment key={crumb.href}>
                    {idx > 0 && <BreadcrumbSeparator />}
                    <BreadcrumbItem>
                      {crumb.isLast ? (
                        <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink render={<Link href={crumb.href} />}>
                          {crumb.label}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </React.Fragment>
                ))
              )}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </div>
    </header>
  );
}

