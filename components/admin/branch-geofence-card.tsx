"use client";

import { useTransition } from "react";
import {
  Copy,
  ExternalLink,
  MapPin,
  MapPinOff,
  Navigation,
  Pencil,
  Power,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BranchGeofenceDialog } from "@/components/admin/branch-geofence-dialog";
import { toggleGeofenceEnabled, updateBranchGeofence } from "@/lib/modules/branches/actions";

interface BranchGeofenceCardProps {
  branch: {
    id: string;
    name: string;
    location: string;
    latitude: number | null;
    longitude: number | null;
    geofenceRadiusMeters: number;
    maxAcceptableAccuracyMeters: number;
    geofenceEnabled: boolean;
  };
  canWrite: boolean;
}

export function BranchGeofenceCard({ branch, canWrite }: BranchGeofenceCardProps) {
  const [isToggling, startTransition] = useTransition();

  const hasCoords = branch.latitude != null && branch.longitude != null;
  const lat = branch.latitude ?? 0;
  const lng = branch.longitude ?? 0;

  const handleToggle = () => {
    if (!hasCoords && !branch.geofenceEnabled) {
      toast.error("Set branch latitude and longitude before enabling geofencing.");
      return;
    }

    const formData = new FormData();
    formData.set("id", branch.id);
    formData.set("nextGeofenceEnabled", (!branch.geofenceEnabled).toString());

    startTransition(async () => {
      try {
        await toggleGeofenceEnabled(formData);
        toast.success(
          !branch.geofenceEnabled
            ? "Geofence enforcement activated."
            : "Geofence enforcement disabled (permissive mode)."
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to toggle geofence";
        toast.error(msg);
      }
    });
  };

  const copyCoords = () => {
    if (!hasCoords) return;
    navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    toast.success("Coordinates copied to clipboard");
  };

  // OpenStreetMap embed URL centered around branch coordinates
  // ±0.0035 degrees is roughly 350-400 meters window, ideal for viewing 50-250m geofence radius
  const osmBbox = `${lng - 0.0035}%2C${lat - 0.0025}%2C${lng + 0.0035}%2C${lat + 0.0025}`;
  const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${osmBbox}&layer=mapnik&marker=${lat}%2C${lng}`;
  const osmFullUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
  const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

  return (
    <Card className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Navigation className="size-5 text-foreground shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-bold">Attendance Geofence & Location</CardTitle>
                {branch.geofenceEnabled ? (
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 font-medium text-[11px] gap-1">
                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Enforced
                  </Badge>
                ) : hasCoords ? (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 font-medium text-[11px]">
                    Configured (Disabled)
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground text-[11px]">
                    Coordinates Missing
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Physical perimeter validation for mobile staff clock-ins and attendance tracking
              </CardDescription>
            </div>
          </div>

          {canWrite && (
            <CardAction className="flex items-center gap-2">
              {hasCoords && (
                <Button
                  size="sm"
                  variant={branch.geofenceEnabled ? "secondary" : "outline"}
                  onClick={handleToggle}
                  disabled={isToggling}
                  className="gap-1.5 text-xs h-8"
                >
                  <Power className="size-3.5" />
                  {branch.geofenceEnabled ? "Disable Fence" : "Enable Fence"}
                </Button>
              )}

              <BranchGeofenceDialog
                branchId={branch.id}
                branchName={branch.name}
                action={updateBranchGeofence.bind(null, branch.id)}
                defaultValues={{
                  latitude: branch.latitude,
                  longitude: branch.longitude,
                  geofenceRadiusMeters: branch.geofenceRadiusMeters,
                  maxAcceptableAccuracyMeters: branch.maxAcceptableAccuracyMeters,
                  geofenceEnabled: branch.geofenceEnabled,
                }}
                trigger={
                  <Button size="sm" variant="default" className="gap-1.5 text-xs h-8">
                    <Pencil className="size-3.5" />
                    Edit Geofence
                  </Button>
                }
              />
            </CardAction>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-5">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Metrics & Rule Summary */}
          <div className="space-y-4 lg:col-span-6 flex flex-col justify-between">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* GPS Coordinates Pod */}
              <div className="rounded-xl border border-border/50 bg-slate-50/70 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-3.5 text-foreground" />
                    GPS Coordinates
                  </span>
                  {hasCoords && (
                    <button
                      type="button"
                      onClick={copyCoords}
                      className="hover:text-foreground transition-colors"
                      title="Copy coordinates"
                    >
                      <Copy className="size-3" />
                    </button>
                  )}
                </div>
                <div className="font-mono text-sm font-semibold text-foreground">
                  {hasCoords ? (
                    `${lat.toFixed(5)}, ${lng.toFixed(5)}`
                  ) : (
                    <span className="text-xs text-muted-foreground font-sans font-normal italic">
                      No coordinates set
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {branch.location}
                </div>
              </div>

              {/* Radius Pod */}
              <div className="rounded-xl border border-border/50 bg-slate-50/70 p-3.5 space-y-1.5">
                <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
                  <span>Geofence Radius</span>
                  <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                    ±{branch.maxAcceptableAccuracyMeters}m GPS tolerance
                  </Badge>
                </div>
                <div className="font-mono text-sm font-semibold text-foreground flex items-baseline gap-1">
                  <span>{branch.geofenceRadiusMeters}</span>
                  <span className="text-xs font-normal text-muted-foreground">meters perimeter</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {branch.geofenceRadiusMeters <= 10
                    ? "Tight / Desk perimeter"
                    : branch.geofenceRadiusMeters <= 25
                    ? "Office / Room perimeter"
                    : branch.geofenceRadiusMeters <= 60
                    ? "Compact / Kiosk perimeter"
                    : branch.geofenceRadiusMeters <= 120
                    ? "Standard Dine-In radius"
                    : "Large branch / Mall perimeter"}
                </div>
              </div>
            </div>

            {/* Architectural Rule Cards */}
            <div className="rounded-xl border border-border/50 bg-slate-50/40 p-3.5 space-y-2.5">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-foreground" />
                Clock-In Enforcement Rules
              </div>
              <ul className="text-xs text-muted-foreground space-y-1.5 pl-1">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-foreground shrink-0">•</span>
                  <span>
                    <strong className="text-foreground">Clock-IN (Arrival):</strong> Strictly verified. Rejects clock-in punches beyond the {branch.geofenceRadiusMeters}m boundary when geofencing is enabled.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-foreground shrink-0">•</span>
                  <span>
                    <strong className="text-foreground">Clock-OUT (Departure):</strong> Asymmetrically accepted from any location so worked shifts are never lost if staff leave the perimeter before punching out.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-foreground shrink-0">•</span>
                  <span>
                    <strong className="text-foreground">Anti-Spoofing:</strong> Simulated mock locations or readings fuzzier than {branch.maxAcceptableAccuracyMeters}m are rejected automatically.
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* Right Column: Interactive Map Preview */}
          <div className="lg:col-span-6">
            {hasCoords ? (
              <div className="space-y-2">
                <div className="relative overflow-hidden rounded-xl border border-border/80 bg-muted/20 shadow-xs h-[230px]">
                  <iframe
                    title={`Map preview of ${branch.name}`}
                    src={osmEmbedUrl}
                    className="w-full h-full border-0 pointer-events-auto"
                    loading="lazy"
                  />
                  {/* Floating perimeter badge */}
                  <div className="absolute top-2 left-2 rounded-md bg-white/90 backdrop-blur-xs px-2 py-1 text-[10px] font-medium border border-border/70 shadow-xs flex items-center gap-1 text-foreground">
                    <span className="size-2 rounded-full bg-primary" />
                    {branch.geofenceRadiusMeters}m Geofence Center
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                  <span>© OpenStreetMap contributors</span>
                  <div className="flex items-center gap-3">
                    <a
                      href={osmFullUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
                    >
                      OpenStreetMap <ExternalLink className="size-2.5" />
                    </a>
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
                    >
                      Google Maps <ExternalLink className="size-2.5" />
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/10 p-8 text-center h-[230px] space-y-3">
                <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <MapPinOff className="size-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">No GPS Coordinates Configured</p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Set this branch&apos;s physical latitude and longitude so staff can clock in via mobile.
                  </p>
                </div>
                {canWrite && (
                  <BranchGeofenceDialog
                    branchId={branch.id}
                    branchName={branch.name}
                    action={updateBranchGeofence.bind(null, branch.id)}
                    defaultValues={{
                      latitude: branch.latitude,
                      longitude: branch.longitude,
                      geofenceRadiusMeters: branch.geofenceRadiusMeters,
                      maxAcceptableAccuracyMeters: branch.maxAcceptableAccuracyMeters,
                      geofenceEnabled: branch.geofenceEnabled,
                    }}
                    trigger={
                      <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                        <MapPin className="size-3.5 text-primary" />
                        Set Coordinates
                      </Button>
                    }
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
