import type { Metadata } from "next";
import {
  can,
  requirePermission,
  listCustomRoles,
  getPermissionMatrix,
} from "@/lib/modules/identity/server";
import { RolesTable } from "@/components/admin/roles-table";

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
    <div className="space-y-4">
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
