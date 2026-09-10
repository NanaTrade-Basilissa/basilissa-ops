"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Smartphone,
  MapPin,
  Compass,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type BranchOption = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusMeters: number;
  geofenceEnabled: boolean;
};

type EmployeeOption = {
  id: string;
  name: string;
  employeeCode: string | null;
  branchIds: string[];
};

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function MobileClockInDialog({
  branches,
  employees,
  defaultBranchId,
  defaultEmployeeId,
  trigger,
}: {
  branches: BranchOption[];
  employees: EmployeeOption[];
  defaultBranchId?: string;
  defaultEmployeeId?: string;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState(
    defaultBranchId || branches[0]?.id || "",
  );
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    defaultEmployeeId || employees[0]?.id || "",
  );
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");

  // GPS State
  const [locating, setLocating] = useState(false);
  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedBranch = branches.find((b) => b.id === selectedBranchId);

  const fetchLocation = () => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your device/browser.");
      return;
    }

    setLocating(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setGpsError(err.message || "Failed to acquire GPS location.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen && !coords) {
      fetchLocation();
    }
  };

  // Compute live distance if both coords and branch coordinates are present
  const distance =
    coords && selectedBranch?.latitude && selectedBranch?.longitude
      ? calculateDistance(
          coords.latitude,
          coords.longitude,
          selectedBranch.latitude,
          selectedBranch.longitude,
        )
      : null;

  const isInside =
    distance !== null && selectedBranch
      ? distance <= selectedBranch.geofenceRadiusMeters
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coords) {
      toast.error("GPS location is required for mobile clock-in.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/attendance/punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          branchId: selectedBranchId,
          direction,
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracyMeters: coords.accuracy,
          deviceId: navigator.userAgent.slice(0, 50),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Clock-in failed");
        setSubmitting(false);
        return;
      }

      toast.success(
        `Successfully clocked ${direction === "IN" ? "in" : "out"} via mobile app!`,
        {
          description: data.distanceMeters !== undefined
            ? `Distance: ${data.distanceMeters}m (${data.geofenceDecision})`
            : undefined,
        },
      );

      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Network error submitting mobile punch.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          (trigger as React.ReactElement) || (
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs font-medium">
              <Smartphone className="size-4 text-primary" />
              <span>Mobile Clock-In Test</span>
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Smartphone className="size-5 text-primary" />
            Mobile Geofence Clock-In
          </DialogTitle>
          <DialogDescription className="text-xs">
            Test mobile attendance capture with GPS location and server-side geofencing.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Employee Selection */}
          <div className="space-y-1.5">
            <Label htmlFor="mobile-emp-select" className="text-xs font-medium">
              Employee
            </Label>
            <NativeSelect
              id="mobile-emp-select"
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="h-9 text-xs"
              required
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} {emp.employeeCode ? `(${emp.employeeCode})` : ""}
                </option>
              ))}
            </NativeSelect>
          </div>

          {/* Branch Selection */}
          <div className="space-y-1.5">
            <Label htmlFor="mobile-branch-select" className="text-xs font-medium">
              Branch
            </Label>
            <NativeSelect
              id="mobile-branch-select"
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="h-9 text-xs"
              required
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {!b.geofenceEnabled ? "(Geofence off)" : ""}
                </option>
              ))}
            </NativeSelect>
          </div>

          {/* Punch Direction */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Direction</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={direction === "IN" ? "default" : "outline"}
                size="sm"
                className="h-9 text-xs font-medium"
                onClick={() => setDirection("IN")}
              >
                Clock In (Arrival)
              </Button>
              <Button
                type="button"
                variant={direction === "OUT" ? "default" : "outline"}
                size="sm"
                className="h-9 text-xs font-medium"
                onClick={() => setDirection("OUT")}
              >
                Clock Out (Departure)
              </Button>
            </div>
          </div>

          {/* Live GPS & Geofence Status Card */}
          <div className="rounded-lg border border-border/80 bg-muted/40 p-3 text-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Compass className="size-3.5 text-primary" />
                Live GPS Position
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] gap-1"
                onClick={fetchLocation}
                disabled={locating}
              >
                <RefreshCw className={`size-3 ${locating ? "animate-spin" : ""}`} />
                {locating ? "Acquiring..." : "Refresh GPS"}
              </Button>
            </div>

            {gpsError ? (
              <div className="flex items-start gap-1.5 text-destructive text-xs">
                <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                <span>{gpsError}</span>
              </div>
            ) : coords ? (
              <div className="space-y-1">
                <div className="flex justify-between text-muted-foreground font-mono">
                  <span>Coords:</span>
                  <span className="text-foreground">
                    {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground font-mono">
                  <span>Accuracy:</span>
                  <span className="text-foreground">±{Math.round(coords.accuracy)}m</span>
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground italic flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" />
                Acquiring satellite signal...
              </div>
            )}

            {/* Geofence Proximity Indicator */}
            {selectedBranch && (
              <div className="border-t border-border/60 pt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <MapPin className="size-3 text-muted-foreground" />
                    Branch Geofence:
                  </span>
                  {!selectedBranch.geofenceEnabled ? (
                    <Badge variant="outline" className="text-[10px]">Disabled</Badge>
                  ) : distance !== null ? (
                    <Badge
                      variant={isInside ? "default" : "destructive"}
                      className="text-[10px] gap-1"
                    >
                      {isInside ? (
                        <>
                          <CheckCircle2 className="size-3" />
                          Inside fence ({distance}m)
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="size-3" />
                          Outside ({distance}m &gt; {selectedBranch.geofenceRadiusMeters}m)
                        </>
                      )}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">Coordinates not configured</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 text-xs"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-9 text-xs font-medium"
              disabled={submitting || locating || !coords}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Recording...
                </>
              ) : (
                `Record Mobile Clock-${direction === "IN" ? "In" : "Out"}`
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
