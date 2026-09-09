"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, MapPin, Save } from "lucide-react";
import { toast } from "sonner";
import type { BranchFormState } from "@/lib/modules/branches/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function BranchForm({
  action,
  defaultValues,
  submitLabel,
  onSuccess,
}: {
  action: (prevState: BranchFormState, formData: FormData) => Promise<BranchFormState>;
  defaultValues?: {
    name: string;
    slug: string;
    location: string;
    isActive: boolean;
    latitude?: number | null;
    longitude?: number | null;
    geofenceRadiusMeters?: number;
    geofenceEnabled?: boolean;
  };
  submitLabel: string;
  onSuccess?: () => void;
}) {
  const [state, formAction, isPending] = useActionState<BranchFormState, FormData>(action, undefined);
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [slug, setSlug] = useState(defaultValues?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(defaultValues?.slug));
  const [origin, setOrigin] = useState("");
  const [latitude, setLatitude] = useState(defaultValues?.latitude?.toString() ?? "");
  const [longitude, setLongitude] = useState(defaultValues?.longitude?.toString() ?? "");
  const [geofenceEnabled, setGeofenceEnabled] = useState(defaultValues?.geofenceEnabled ?? false);
  const [detectingLocation, setDetectingLocation] = useState(false);

  useEffect(() => {
    if (state?.success) onSuccess?.();
  }, [state, onSuccess]);

  // `window` is an external system unavailable during SSR, so reading it in a
  // lazy useState initializer would break hydration. `origin` starts empty and
  // fills in after mount, which is why the rule is disabled here rather than
  // the effect restructured.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleDetectLocation = () => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      toast.error("Geolocation is not supported in this browser");
      return;
    }
    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setDetectingLocation(false);
        toast.success("Current GPS location retrieved");
      },
      (error) => {
        setDetectingLocation(false);
        toast.error(error.message || "Failed to retrieve location");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <form action={formAction} className="max-w-lg space-y-5" noValidate>
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="name">Branch name</Label>
        <Input
          id="name"
          name="name"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          placeholder="Basilissa Cantonments"
        />
        {state?.fieldErrors?.name && <p className="text-xs text-destructive">{state.fieldErrors.name}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="slug">Slug</Label>
        <Input
          id="slug"
          name="slug"
          required
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(slugify(e.target.value));
          }}
          placeholder="cantonments"
          className="font-mono"
        />
        {state?.fieldErrors?.slug && <p className="text-xs text-destructive">{state.fieldErrors.slug}</p>}
        <p className="text-xs text-muted-foreground">
          Feedback link:{" "}
          <span className="font-mono">
            {origin || "https://your-domain"}/feedback?branch={slug || "…"}
          </span>
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="location">Location address</Label>
        <Input
          id="location"
          name="location"
          required
          defaultValue={defaultValues?.location}
          placeholder="Cantonments Road, Accra"
        />
        {state?.fieldErrors?.location && (
          <p className="text-xs text-destructive">{state.fieldErrors.location}</p>
        )}
      </div>

      {/* Geofencing & GPS Coordinates */}
      <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="geofenceEnabled" className="text-sm font-semibold">
              Attendance GPS Geofence
            </Label>
            <p className="text-xs text-muted-foreground">
              Restrict mobile clock-ins to physical branch boundaries
            </p>
          </div>
          <Switch
            id="geofenceEnabled"
            name="geofenceEnabled"
            checked={geofenceEnabled}
            onChange={(e) => setGeofenceEnabled(e.target.checked)}
          />
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
              placeholder="e.g. 5.5862"
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
              placeholder="e.g. -0.1743"
            />
            {state?.fieldErrors?.longitude && (
              <p className="text-xs text-destructive">{state.fieldErrors.longitude}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="space-y-1">
            <Label htmlFor="geofenceRadiusMeters" className="text-xs">Radius (meters)</Label>
            <Input
              id="geofenceRadiusMeters"
              name="geofenceRadiusMeters"
              type="number"
              min={10}
              max={5000}
              defaultValue={defaultValues?.geofenceRadiusMeters ?? 150}
              className="w-28"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDetectLocation}
            disabled={detectingLocation}
            className="gap-1.5 self-end text-xs"
          >
            {detectingLocation ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <MapPin className="size-3.5 text-primary" />
            )}
            Detect current GPS
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch id="isActive" name="isActive" defaultChecked={defaultValues?.isActive ?? true} />
        <div>
          <Label htmlFor="isActive" className="mb-0">
            Active
          </Label>
          <p className="text-xs text-muted-foreground">Inactive branches stop accepting new feedback.</p>
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        {submitLabel}
      </Button>
    </form>
  );
}
