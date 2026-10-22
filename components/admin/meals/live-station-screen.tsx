"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  UtensilsCrossed,
  ArrowLeft,
  RotateCw,
  CheckCircle2,
  Clock,
  Users,
  Search,
  BellRing,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ClaimItem {
  employeeName: string;
  employeeCode: string | null;
  jobTitle: string | null;
  claimedAt: string;
  timeFormatted: string;
}

interface PendingItem {
  employeeName: string;
  employeeCode: string | null;
  jobTitle: string | null;
}

interface StationData {
  branchName: string;
  branchSlug: string;
  dateKey: string;
  hasPlan: boolean;
  dishName: string | null;
  totalPortions: number;
  claimedCount: number;
  remainingCount: number;
  claims: ClaimItem[];
  pending: PendingItem[];
}

export function LiveStationScreen({
  branchId,
  initialData,
}: {
  branchId: string;
  initialData: StationData;
}) {
  const [data, setData] = useState<StationData>(initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isNotifying, setIsNotifying] = useState(false);
  const [lastNotifiedAt, setLastNotifiedAt] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  const handleNotifyFoodReady = async () => {
    if (!data.hasPlan || !data.dishName) {
      toast.error("No active meal plan is scheduled for today.");
      return;
    }

    setIsNotifying(true);
    try {
      const res = await fetch("/api/admin/meals/station", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.error || "Failed to broadcast notifications.");
        return;
      }

      const timeStr = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setLastNotifiedAt(timeStr);
      toast.success(
        `Staff Notified! Alert sent to ${json.recipientCount} staff members for ${json.dishName}.`,
        { description: `${json.pushCount} mobile push notifications delivered.` }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to broadcast notification.";
      toast.error(message);
    } finally {
      setIsNotifying(false);
    }
  };

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/admin/meals/station?branchId=${branchId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.data) {
          setData(json.data);
          setLastRefreshedAt(new Date());
        }
      }
    } catch {
      // silent background refresh failure
    } finally {
      setIsRefreshing(false);
    }
  }, [branchId]);

  // Auto-poll every 12 seconds
  useEffect(() => {
    const timer = setInterval(refreshData, 12000);
    return () => clearInterval(timer);
  }, [refreshData]);

  const filteredPending = data.pending.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.employeeName.toLowerCase().includes(q) ||
      (p.employeeCode && p.employeeCode.toLowerCase().includes(q))
    );
  });

  const percentServed =
    data.totalPortions > 0
      ? Math.round((data.claimedCount / data.totalPortions) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Station Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b w-full min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/admin/meals?branchId=${branchId}`} className="shrink-0">
            <Button variant="outline" size="icon" title="Back to Meal Planner">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
                Kitchen Serving Station
              </h1>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 gap-1 text-xs shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {data.branchName} Branch &bull; {data.dateKey}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-1 sm:pt-0">
          <span className="text-xs text-muted-foreground font-mono">
            Updated {lastRefreshedAt.toLocaleTimeString()}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshData}
            disabled={isRefreshing}
            className="gap-1.5"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Main Counter Display */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Today's Dish */}
        <Card className="shadow-xs flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <UtensilsCrossed className="h-4 w-4 text-foreground" />
                Today&apos;s Staff Dish
              </CardTitle>
              {lastNotifiedAt && (
                <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-300">
                  Notified {lastNotifiedAt}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-xl font-bold text-foreground line-clamp-2">
                {data.dishName || "No Dish Scheduled Today"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {data.hasPlan ? `${data.totalPortions} staff portions reserved` : "Menu draft pending"}
              </p>
            </div>

            <Button
              size="sm"
              onClick={handleNotifyFoodReady}
              disabled={isNotifying || !data.hasPlan}
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
            >
              <BellRing className={`h-3.5 w-3.5 ${isNotifying ? "animate-bounce" : ""}`} />
              {isNotifying
                ? "Broadcasting alert to staff..."
                : lastNotifiedAt
                ? `Re-send "Food is Ready" Alert (Notified ${lastNotifiedAt})`
                : "Notify Staff: Food is Ready"}
            </Button>
          </CardContent>
        </Card>

        {/* Portions Served */}
        <Card className="shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Portions Served
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {data.claimedCount}
              </span>
              <span className="text-lg font-medium text-muted-foreground">
                / {data.totalPortions}
              </span>
            </div>
            <div className="mt-2 w-full bg-muted h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${percentServed}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Remaining Portions */}
        <Card className="shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              Remaining To Serve
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-extrabold text-foreground">
              {data.remainingCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Staff members awaiting meal collection
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Lists Split: Recent Claims vs Pending Staff */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Recent Claims Feed */}
        <Card className="shadow-xs">
          <CardHeader className="border-b pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Served Staff ({data.claims.length})
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                Most recent on top
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {data.claims.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No meals collected yet today. When staff scan the wall QR, they will appear here instantly.
              </div>
            ) : (
              <div className="divide-y max-h-[480px] overflow-y-auto">
                {data.claims.map((claim, idx) => (
                  <div
                    key={`${claim.employeeCode}-${claim.claimedAt}`}
                    className={`flex items-center justify-between p-3.5 transition-colors ${
                      idx === 0 ? "bg-emerald-50/50 dark:bg-emerald-950/20" : "hover:bg-muted/30"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">
                          {claim.employeeName}
                        </span>
                        {claim.employeeCode && (
                          <span className="font-mono text-xs text-muted-foreground">
                            {claim.employeeCode}
                          </span>
                        )}
                        {idx === 0 && (
                          <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-300">
                            Just now
                          </Badge>
                        )}
                      </div>
                      {claim.jobTitle && (
                        <p className="text-xs text-muted-foreground">{claim.jobTitle}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        {claim.timeFormatted}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Pending Staff List with Search */}
        <Card className="shadow-xs">
          <CardHeader className="border-b pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Pending Collection ({filteredPending.length})
              </CardTitle>
              <div className="relative w-44">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  placeholder="Search staff..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredPending.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {searchQuery
                  ? "No matching employees found."
                  : "All reserved meals have been claimed for today!"}
              </div>
            ) : (
              <div className="divide-y max-h-[480px] overflow-y-auto">
                {filteredPending.map((p) => (
                  <div
                    key={p.employeeCode || p.employeeName}
                    className="flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-foreground">
                          {p.employeeName}
                        </span>
                        {p.employeeCode && (
                          <span className="font-mono text-xs text-muted-foreground">
                            {p.employeeCode}
                          </span>
                        )}
                      </div>
                      {p.jobTitle && (
                        <p className="text-xs text-muted-foreground">{p.jobTitle}</p>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      Awaiting Scan
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
