import { can } from "@/lib/modules/identity/authorization";
import { requirePermission } from "@/lib/modules/identity/server";
import { getOdooDashboardData } from "@/lib/modules/odoo/server";
import { OdooSyncPanel } from "@/components/admin/odoo-sync-panel";

export const dynamic = "force-dynamic";

export default async function AdminOdooSyncPage() {
  const actor = await requirePermission("odoo:read");
  const canManage = can(actor, "odoo:manage");
  const data = await getOdooDashboardData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Odoo 17 ERP Synchronisation
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Cache employees from Odoo and sync settled daily attendance (with approved overtime
          closing times) every midnight at 12:00 AM.
        </p>
      </div>

      <OdooSyncPanel
        initialConnection={data.connection}
        employeeStats={data.employeeStats}
        attendanceStats={data.attendanceStats}
        employees={data.employees}
        recentDays={data.recentDays}
        canManage={canManage}
      />
    </div>
  );
}
