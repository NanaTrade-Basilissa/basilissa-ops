import { cookies } from "next/headers";
import { requireAdminShell } from "@/lib/modules/identity/server";
import { isFeatureEnabled } from "@/lib/platform/features";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  // requireAdminShell, not requirePermission: this layout wraps the MFA
  // enrolment page too, so gating it on MFA would redirect that page to
  // itself. Each page below applies its own permission and MFA check.
  const session = await requireAdminShell();
  const enabledFeatures = { attendance: isFeatureEnabled("attendance"), aptitude: isFeatureEnabled("aptitude") };

  // Sidebar collapsed/expanded state persists across reloads via a cookie
  // the Sidebar primitive itself writes (see components/ui/sidebar.tsx);
  // reading it here on the server avoids a flash of the default state.
  const sidebarState = (await cookies()).get("sidebar_state")?.value;

  return (
    <SidebarProvider
      defaultOpen={sidebarState !== "false"}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 64)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar enabledFeatures={enabledFeatures} user={{ name: session.name, email: session.email }} />
      <SidebarInset>
        <SiteHeader />
        <main className="flex-1 px-4 py-6 lg:px-6 lg:py-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
