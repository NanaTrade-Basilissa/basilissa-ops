"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  updateDevice,
  toggleDeviceActive,
  getDeviceActivityLog,
  type DeviceActivityEntry,
} from "@/lib/modules/devices/actions";
import { DeviceForm } from "@/components/admin/device-form";
import { InspectorSheet } from "@/components/admin/inspector-sheet";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  device: DeviceDetail | null;
  branches: { id: string; name: string }[];
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
    <InspectorSheet
      open={open}
      onOpenChange={handleOpenChange}
      title={device?.label || device?.serialNumber || "Device"}
      description={
        device
          ? `Registered ${new Date(device.registeredAt).toLocaleDateString()} · Last seen ${
              device.lastSeenAt ? timeAgo(device.lastSeenAt) : "never"
            }`
          : undefined
      }
      badge={
        device ? (
          <StatusBadge tone={device.isActive ? "good" : "neutral"} dot>
            {device.isActive ? "Active" : "Inactive"}
          </StatusBadge>
        ) : undefined
      }
    >
      {device && (
        <div className="space-y-6">
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
            <div className="space-y-3 rounded-xl border border-border/70 bg-card p-4 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Serial number</span>
                <p className="font-mono text-foreground">{device.serialNumber}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Branch</span>
                <p className="text-foreground">{device.branchName}</p>
              </div>
              {device.label && (
                <div>
                  <span className="text-xs text-muted-foreground">Label</span>
                  <p className="text-foreground">{device.label}</p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 border-t border-border/70 pt-4">
            <h3 className="text-sm font-medium text-foreground">Recent activity</h3>
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
              <p className="text-xs italic text-muted-foreground">
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
                    <span className="shrink-0 tabular-nums text-muted-foreground">{timeAgo(entry.receivedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {device.canWrite && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 p-4">
              <div>
                <p className="text-xs font-semibold text-foreground">Terminal Status</p>
                <p className="text-xs text-muted-foreground">
                  {device.isActive
                    ? "Deactivating stops attendance pushes from this terminal."
                    : "Reactivate to accept attendance pushes from this terminal."}
                </p>
              </div>
              <form action={toggleDeviceActive}>
                <input type="hidden" name="id" value={device.id} />
                <input type="hidden" name="nextIsActive" value={(!device.isActive).toString()} />
                <Button type="submit" size="sm" variant={device.isActive ? "destructive" : "secondary"}>
                  {device.isActive ? "Deactivate" : "Activate"}
                </Button>
              </form>
            </div>
          )}
        </div>
      )}
    </InspectorSheet>
  );
}
