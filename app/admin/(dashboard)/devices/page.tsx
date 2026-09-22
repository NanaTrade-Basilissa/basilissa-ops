import type { Metadata } from "next";
import { Fingerprint, Plus } from "lucide-react";
import { prisma } from "@/lib/platform/prisma";
import { createDevice } from "@/lib/modules/devices/actions";
import { requireAnyBranchPermission, can } from "@/lib/modules/identity/server";
import { Button } from "@/components/ui/button";
import { DeviceDialog } from "@/components/admin/device-dialog";
import { DevicesTable } from "@/components/admin/devices-table";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export const metadata: Metadata = { title: "Devices" };
export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const { actor, scope } = await requireAnyBranchPermission("device:read");
  const canCreate = can(actor, "device:write");

  const deviceFilter = scope.kind === "branches" ? { branchId: { in: scope.branchIds } } : undefined;
  const branchFilter = scope.kind === "branches" ? { id: { in: scope.branchIds } } : undefined;

  const [devices, branches] = await Promise.all([
    prisma.device.findMany({
      where: deviceFilter,
      orderBy: { registeredAt: "desc" },
      include: { branch: { select: { name: true } } },
    }),
    prisma.branch.findMany({
      where: branchFilter,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const rows = devices.map((d) => ({
    id: d.id,
    serialNumber: d.serialNumber,
    branchId: d.branchId,
    branchName: d.branch.name,
    label: d.label,
    isActive: d.isActive,
    registeredAt: d.registeredAt.toISOString(),
    canWrite: can(actor, "device:write", { branchId: d.branchId }),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Devices</h1>
          <p className="text-sm text-muted-foreground">
            Fingerprint terminals and the branch each one belongs to.
          </p>
        </div>
        {canCreate && branches.length > 0 && (
          <DeviceDialog
            action={createDevice}
            branches={branches}
            submitLabel="Register device"
            title="Register a device"
            description="A terminal's branch is set once here — attendance from it resolves against this branch, never against wherever the punching employee happens to be assigned."
            trigger={
              <Button size="sm" className="h-9 gap-1.5 text-xs">
                <Plus className="size-4" />
                <span className="hidden sm:inline">Register device</span>
              </Button>
            }
          />
        )}
      </div>

      {devices.length === 0 ? (
        <Empty className="border py-12">
          <EmptyMedia variant="icon">
            <Fingerprint className="size-4" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No devices registered yet</EmptyTitle>
            <EmptyDescription>
              Register a fingerprint terminal and assign it to a branch before it can push attendance.
            </EmptyDescription>
          </EmptyHeader>
          {!canCreate && (
            <EmptyContent>
              <p className="text-xs text-muted-foreground">
                You don&apos;t have permission to register devices.
              </p>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <DevicesTable devices={rows} branches={branches} />
      )}
    </div>
  );
}
