import type { Metadata } from "next";
import {
  can,
  requirePermission,
  listCustomRoles,
  getPermissionMatrix,
} from "@/lib/modules/identity/server";
import { RolesTable } from "@/components/admin/roles-table";
import { RoleDialog } from "@/components/admin/role-dialog";

export const metadata: Metadata = { title: "Roles & Permissions" };
export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const actor = await requirePermission("roles:read");

  const canCreate = can(actor, "roles:create");
  const canUpdate = can(actor, "roles:update");
  const canDelete = can(actor, "roles:delete");

  const [roles, matrix] = await Promise.all([
    listCustomRoles(),
    Promise.resolve(getPermissionMatrix()),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-bold text-foreground">
              Roles &amp; Permissions
            </h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground mt-1">
            Create custom roles and define exactly which resources and actions each role can access.
            Authorization is strictly deny-by-default.
          </p>
        </div>

        {canCreate && <RoleDialog matrix={matrix} />}
      </div>

      <RolesTable
        roles={roles}
        matrix={matrix}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </div>
  );
}
