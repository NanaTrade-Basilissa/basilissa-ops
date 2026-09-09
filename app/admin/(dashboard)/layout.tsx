import { cookies } from "next/headers";
import { heldPermissions, requireAdminShell } from "@/lib/modules/identity/server";
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
  const userPermissions = heldPermissions(session);

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
      <AppSidebar
        enabledFeatures={enabledFeatures}
        user={{ name: session.name, email: session.email }}
        permissions={userPermissions}
      />
      <SidebarInset>
        <SiteHeader />
        {/*
          The header stays outside this wrapper so its border and background
          span the full width of the inset area; only the page content below
          it is centered with a cap, so a wide monitor does not leave data
          tables and forms pinned to the left with the rest of the screen bare.
        */}
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 lg:px-6 lg:py-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
