"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Fingerprint } from "lucide-react";
import {
  updateDevice,
  toggleDeviceActive,
  getDeviceActivityLog,
  type DeviceActivityEntry,
} from "@/lib/modules/devices/actions";
import { DeviceForm } from "@/components/admin/device-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export type DeviceDetail = {
  id: string;
  serialNumber: string;
  branchId: string;
  branchName: string;
  label: string | null;
  isActive: boolean;
  registeredAt: string;
  lastSeenAt: string | null;
  canWrite: boolean;
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

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

  const [activity, setActivity] = useState<DeviceActivityEntry[] | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadActivity = useCallback((deviceId: string) => {
    startTransition(async () => {
      setActivity(await getDeviceActivityLog(deviceId));
    });
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setActivity(null);
  };

  useEffect(() => {
    if (open && device) loadActivity(device.id);
  }, [open, device, loadActivity]);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
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
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={device.isActive ? "default" : "outline"}>
                {device.isActive ? "Active" : "Inactive"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Registered {new Date(device.registeredAt).toLocaleDateString()}
              </span>
              <span className="text-xs text-muted-foreground">
                · Last seen {device.lastSeenAt ? timeAgo(device.lastSeenAt) : "never"}
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

            <div className="space-y-2 border-t border-border pt-4">
              <h3 className="text-sm font-medium">Recent activity</h3>
              <p className="text-xs text-muted-foreground">
                Handshakes and data pushes, for debugging connectivity. Heartbeats aren&apos;t
                logged individually — see &quot;Last seen&quot; above for those.
              </p>

              {isPending && !activity && (
                <div className="space-y-1.5 pt-1">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              )}

              {activity && activity.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  Nothing recorded yet — this device hasn&apos;t connected.
                </p>
              )}

              {activity && activity.length > 0 && (
                <ul className="max-h-64 space-y-1.5 overflow-y-auto text-xs">
                  {activity.map((entry, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 border-b border-border/50 pb-1.5">
                      <div className="min-w-0">
                        <span className="font-mono text-[10px] text-muted-foreground">{entry.kind}</span>
                        <p className="truncate text-foreground">{entry.summary}</p>
                      </div>
                      <span className="shrink-0 text-muted-foreground">{timeAgo(entry.receivedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
