import { requireAdminShell } from "@/lib/modules/identity/server";
import { isFeatureEnabled } from "@/lib/platform/features";
import { logout } from "@/lib/modules/identity/actions";
import { Logo } from "@/components/brand/logo";
import { AdminNav } from "@/components/admin/admin-nav";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  // requireAdminShell, not requirePermission: this layout wraps the MFA
  // enrolment page too, so gating it on MFA would redirect that page to
  // itself. Each page below applies its own permission and MFA check.
  const session = await requireAdminShell();
  const attendanceEnabled = isFeatureEnabled("attendance");

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col lg:gap-6 lg:p-5">
        <Logo />
        <AdminNav attendanceEnabled={attendanceEnabled} />
      </aside>

      <div className="flex min-h-screen flex-col bg-white">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-white px-4 py-3 lg:px-8">
          <div className="lg:hidden">
            <Logo size="sm" />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{session.name}</span>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm">
                <LogOut className="size-4" />
                Sign out
              </Button>
            </form>
          </div>
        </header>

        <div className="border-b border-border bg-sidebar px-4 py-2 lg:hidden">
          <AdminNav attendanceEnabled={attendanceEnabled} />
        </div>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
