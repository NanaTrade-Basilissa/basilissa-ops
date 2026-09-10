"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, MapPin, Navigation, Save, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { BranchFormState } from "@/lib/modules/branches/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface BranchGeofenceDialogProps {
  branchId: string;
  branchName: string;
  action: (prevState: BranchFormState, formData: FormData) => Promise<BranchFormState>;
  defaultValues: {
    latitude?: number | null;
    longitude?: number | null;
    geofenceRadiusMeters: number;
    maxAcceptableAccuracyMeters: number;
    geofenceEnabled: boolean;
  };
  trigger?: React.ReactElement;
}

const RADIUS_PRESETS = [
  { label: "50m", value: 50, note: "Kiosk / Express" },
  { label: "100m", value: 100, note: "Standard Dine-In" },
  { label: "150m", value: 150, note: "Mall / Large Unit" },
  { label: "250m", value: 250, note: "Complex / Drive-thru" },
];

export function BranchGeofenceDialog({
  branchId: _branchId,
  branchName,
  action,
  defaultValues,
  trigger,
}: BranchGeofenceDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<BranchFormState, FormData>(action, undefined);

  const [latitude, setLatitude] = useState(defaultValues.latitude?.toString() ?? "");
  const [longitude, setLongitude] = useState(defaultValues.longitude?.toString() ?? "");
  const [radius, setRadius] = useState(defaultValues.geofenceRadiusMeters || 150);
  const [maxAccuracy, setMaxAccuracy] = useState(defaultValues.maxAcceptableAccuracyMeters || 100);
  const [enabled, setEnabled] = useState(defaultValues.geofenceEnabled);
  const [detecting, setDetecting] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (state?.success) {
      setOpen(false);
      toast.success("Branch geofence settings updated successfully.");
    }
  }, [state]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleDetectLocation = () => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      toast.error("Geolocation is not supported by your browser.");
      return;
    }

    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setDetecting(false);
        toast.success(`Current GPS detected (±${Math.round(pos.coords.accuracy)}m accuracy)`);
      },
      (err) => {
        setDetecting(false);
        toast.error(err.message || "Failed to retrieve device GPS coordinates.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  const parsedLat = parseFloat(latitude);
  const parsedLng = parseFloat(longitude);
  const hasValidCoords = !isNaN(parsedLat) && !isNaN(parsedLng);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger || <Button variant="outline" size="sm">Configure Geofence</Button>} />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-lg">
            <Navigation className="size-5 text-primary" />
            Geofence & Location Manager
          </DialogTitle>
          <DialogDescription>
            Configure GPS coordinates and boundary perimeter for <strong>{branchName}</strong>. Mobile staff must be inside this zone to clock in.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-5 pt-2" noValidate>
          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          {/* Enforce Geofence Switch */}
          <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/30 p-3.5">
            <div className="space-y-0.5">
              <Label htmlFor="geofenceEnabled" className="text-sm font-semibold cursor-pointer">
                Enforce Geofence Validation
              </Label>
              <p className="text-xs text-muted-foreground">
                When active, clock-in punches outside the perimeter are rejected (422).
              </p>
            </div>
            <Switch
              id="geofenceEnabled"
              name="geofenceEnabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
          </div>

          {/* GPS Coordinates Group */}
          <div className="space-y-3 rounded-xl border border-border/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-medium text-xs text-foreground">
                <MapPin className="size-3.5 text-primary" />
                Physical Branch Coordinates
              </div>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={handleDetectLocation}
                disabled={detecting}
                className="h-7 text-xs font-normal"
              >
                {detecting ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Sparkles className="size-3 text-primary" />
                )}
                Detect My Current Location
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="latitude" className="text-xs">Latitude</Label>
                <Input
                  id="latitude"
                  name="latitude"
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="e.g. 5.6219"
                  className="font-mono text-sm"
                />
                {state?.fieldErrors?.latitude && (
                  <p className="text-xs text-destructive">{state.fieldErrors.latitude}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="longitude" className="text-xs">Longitude</Label>
                <Input
                  id="longitude"
                  name="longitude"
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="e.g. -0.1742"
                  className="font-mono text-sm"
                />
                {state?.fieldErrors?.longitude && (
                  <p className="text-xs text-destructive">{state.fieldErrors.longitude}</p>
                )}
              </div>
            </div>

            {hasValidCoords && (
              <p className="text-[11px] text-muted-foreground flex items-center justify-between">
                <span>Coordinates: {parsedLat.toFixed(6)}, {parsedLng.toFixed(6)}</span>
                <a
                  href={`https://www.google.com/maps?q=${parsedLat},${parsedLng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-foreground"
                >
                  Verify pin on Google Maps ↗
                </a>
              </p>
            )}
          </div>

          {/* Perimeter Radius Settings */}
          <div className="space-y-3 rounded-xl border border-border/70 p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="geofenceRadiusMeters" className="text-xs font-medium">
                  Geofence Radius (Meters)
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Acceptable distance radius from branch center
                </p>
              </div>
              <div className="flex items-center gap-1 font-mono text-sm font-semibold">
                <span>{radius}</span>
                <span className="text-xs font-normal text-muted-foreground">meters</span>
              </div>
            </div>

            {/* Presets */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RADIUS_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setRadius(preset.value)}
                  className={`flex flex-col items-center justify-center rounded-lg border p-2 text-center transition-all ${
                    radius === preset.value
                      ? "border-primary bg-primary/10 text-foreground font-medium"
                      : "border-border bg-card hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <span className="text-xs font-bold">{preset.label}</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">{preset.note}</span>
                </button>
              ))}
            </div>

            <input
              type="hidden"
              id="geofenceRadiusMeters"
              name="geofenceRadiusMeters"
              value={radius}
            />

            <div className="pt-2 border-t border-border/50 flex items-center justify-between">
              <div>
                <Label htmlFor="maxAcceptableAccuracyMeters" className="text-xs">
                  Max GPS Accuracy Tolerance
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Reject mobile readings fuzzier than this threshold
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  id="maxAcceptableAccuracyMeters"
                  name="maxAcceptableAccuracyMeters"
                  type="number"
                  min={10}
                  max={500}
                  value={maxAccuracy}
                  onChange={(e) => setMaxAccuracy(parseInt(e.target.value, 10) || 100)}
                  className="w-20 text-right font-mono text-xs h-8"
                />
                <span className="text-xs text-muted-foreground">m</span>
              </div>
            </div>
          </div>

          {enabled && !hasValidCoords && (
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200 flex items-start gap-2">
              <ShieldAlert className="size-4 shrink-0 mt-0.5" />
              <span>
                Geofencing is enabled, but valid latitude and longitude are required before changes can be saved.
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isPending || (enabled && !hasValidCoords)}
              className="gap-1.5"
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save Geofence Settings
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
