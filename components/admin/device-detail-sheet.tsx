"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Fingerprint } from "lucide-react";
import { updateDevice, toggleDeviceActive } from "@/lib/modules/devices/actions";
import { DeviceForm } from "@/components/admin/device-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export type DeviceDetail = {
  id: string;
  serialNumber: string;
  branchId: string;
  branchName: string;
  label: string | null;
  isActive: boolean;
  registeredAt: string;
  canWrite: boolean;
};

export function DeviceDetailSheet({
  device,
  branches,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  device: DeviceDetail | null;
  branches: { id: string; name: string }[];
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setInternalOpen;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {trigger ? <SheetTrigger render={trigger} /> : null}
      <SheetContent className="w-full data-[side=right]:w-full sm:max-w-full data-[side=right]:sm:max-w-full lg:w-1/3 data-[side=right]:lg:w-1/3 lg:max-w-none data-[side=right]:lg:max-w-none overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Fingerprint className="size-4" />
            {device?.label || device?.serialNumber || "Device"}
          </SheetTitle>
        </SheetHeader>

        {device && (
          <div className="space-y-6 px-4 pb-4">
            <div className="flex items-center gap-2">
              <Badge variant={device.isActive ? "default" : "outline"}>
                {device.isActive ? "Active" : "Inactive"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Registered {new Date(device.registeredAt).toLocaleDateString()}
              </span>
            </div>

            {device.canWrite ? (
              <DeviceForm
                action={updateDevice.bind(null, device.id)}
                branches={branches}
                defaultValues={{
                  serialNumber: device.serialNumber,
                  branchId: device.branchId,
                  label: device.label,
                  isActive: device.isActive,
                }}
                submitLabel="Save changes"
                onSuccess={() => toast.success("Device updated")}
              />
            ) : (
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Serial number</span>
                  <p className="font-mono">{device.serialNumber}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Branch</span>
                  <p>{device.branchName}</p>
                </div>
                {device.label && (
                  <div>
                    <span className="text-muted-foreground">Label</span>
                    <p>{device.label}</p>
                  </div>
                )}
              </div>
            )}

            {device.canWrite && (
              <form action={toggleDeviceActive}>
                <input type="hidden" name="id" value={device.id} />
                <input type="hidden" name="nextIsActive" value={(!device.isActive).toString()} />
                <Button type="submit" size="sm" variant={device.isActive ? "destructive" : "secondary"}>
                  {device.isActive ? "Deactivate" : "Activate"}
                </Button>
              </form>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
