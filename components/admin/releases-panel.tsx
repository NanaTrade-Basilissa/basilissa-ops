"use client";

import { useState, useTransition } from "react";
import { Rocket } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createReleaseAction } from "@/lib/modules/releases/actions";
import { PLATFORM_LABELS, UPDATE_MODE_LABELS, type AppReleaseItem } from "@/lib/modules/releases/constants";

type Props = {
  releases: AppReleaseItem[];
  canManage: boolean;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function ReleasesPanel({ releases, canManage }: Props) {
  const [isPending, startTransition] = useTransition();
  const [platform, setPlatform] = useState<"IOS" | "ANDROID">("ANDROID");
  const [version, setVersion] = useState("");
  const [updateMode, setUpdateMode] = useState<"FLEXIBLE" | "REQUIRED">("FLEXIBLE");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [sendPush, setSendPush] = useState(false);

  const latest = (p: "IOS" | "ANDROID") => releases.find((r) => r.platform === p)?.version ?? "none yet";

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createReleaseAction({ platform, version, updateMode, releaseNotes, sendPush });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        sendPush
          ? `Release recorded. Notification sent to ${result.pushed} device${result.pushed === 1 ? "" : "s"}.`
          : "Release recorded.",
      );
      setVersion("");
      setReleaseNotes("");
      setSendPush(false);
      setUpdateMode("FLEXIBLE");
    });
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Rocket className="size-4 text-primary" />
              Record a store release
            </CardTitle>
            <CardDescription>
              Do this after the build is live in the store. Latest now: iOS {latest("IOS")}, Android{" "}
              {latest("ANDROID")}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="platform">Platform</Label>
                  <NativeSelect
                    id="platform"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value as "IOS" | "ANDROID")}
                  >
                    <option value="ANDROID">Android</option>
                    <option value="IOS">iOS</option>
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="version">Version</Label>
                  <Input
                    id="version"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="1.2.0"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="updateMode">Update type</Label>
                  <NativeSelect
                    id="updateMode"
                    value={updateMode}
                    onChange={(e) => setUpdateMode(e.target.value as "FLEXIBLE" | "REQUIRED")}
                  >
                    <option value="FLEXIBLE">Flexible: staff can dismiss it</option>
                    <option value="REQUIRED">Required: blocks the app until updated</option>
                  </NativeSelect>
                </div>
              </div>

              {updateMode === "REQUIRED" && (
                <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  Everyone on a {PLATFORM_LABELS[platform]} build older than {version || "this version"} will be
                  blocked from using the app until they update, including people who skipped earlier releases.
                  A newer release replaces this requirement.
                </p>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="notes">Release notes (optional)</Label>
                <Textarea
                  id="notes"
                  value={releaseNotes}
                  onChange={(e) => setReleaseNotes(e.target.value)}
                  placeholder="What's new in this version"
                  rows={3}
                  maxLength={2000}
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="sendPush"
                  checked={sendPush}
                  onCheckedChange={(checked) => setSendPush(checked === true)}
                />
                <Label htmlFor="sendPush" className="font-normal">
                  Also send a push notification to {PLATFORM_LABELS[platform]} staff
                </Label>
              </div>

              <Button type="submit" disabled={isPending || !version.trim()}>
                {isPending ? "Saving…" : "Record release"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Release history</CardTitle>
        </CardHeader>
        <CardContent>
          {releases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No releases recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {releases.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(r.releasedAt)}</TableCell>
                    <TableCell>{PLATFORM_LABELS[r.platform]}</TableCell>
                    <TableCell className="font-mono">{r.version}</TableCell>
                    <TableCell>
                      <Badge variant={r.updateMode === "REQUIRED" ? "destructive" : "secondary"}>
                        {UPDATE_MODE_LABELS[r.updateMode]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-pre-wrap text-xs text-muted-foreground">
                      {r.releaseNotes ?? "–"}
                    </TableCell>
                    <TableCell className="text-xs">{r.createdByName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
