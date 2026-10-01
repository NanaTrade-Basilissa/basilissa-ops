import { cookies } from "next/headers";
import { branchScope, heldPermissions, requireAdminShell } from "@/lib/modules/identity/server";
import { prisma } from "@/lib/platform/prisma";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  // requireAdminShell, not requirePermission: this layout wraps the MFA
  // enrolment page too, so gating it on MFA would redirect that page to
  // itself. Each page below applies its own permission and MFA check.
  const session = await requireAdminShell();
  const userPermissions = heldPermissions(session);

  // Sidebar badge only, not access: the leave page applies its own gate. The
  // count is limited to the branches this person can see, so a branch manager
  // is not shown other branches' requests.
  const leaveScope = branchScope(session, "attendance:read");
  const pendingLeave =
    leaveScope.kind === "none"
      ? 0
      : await prisma.leaveRequest.count({
          where: {
            status: "PENDING",
            ...(leaveScope.kind === "branches" ? { branchId: { in: leaveScope.branchIds } } : {}),
          },
        });

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
        user={{ name: session.name, email: session.email }}
        permissions={userPermissions}
        badges={{ pendingLeave }}
      />
      <SidebarInset>
        <SiteHeader />
        {/*
          The header stays outside this wrapper so its border and background
          span the full width of the inset area; only the page content below
          it is centered with a cap, so a wide monitor does not leave data
          tables and forms pinned to the left with the rest of the screen bare.
        */}
        <main className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 px-4 py-6 lg:px-6 lg:py-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
