"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RotateCcw, Search } from "lucide-react";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/admin/filter-bar";

export interface FilterOption {
  value: string;
  label: string;
}

export function AptitudeCandidatesFilters({
  basePath,
  statusOptions,
  scoreOptions,
  actionSlot,
}: {
  basePath: string;
  statusOptions: FilterOption[];
  scoreOptions: FilterOption[];
  actionSlot?: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  const activeStatus = searchParams.get("status") ?? "ALL";
  const activeScore = searchParams.get("score") ?? "ALL";

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "ALL") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  useEffect(() => {
    const current = searchParams.get("search") ?? "";
    if (search === current) return;
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (search.trim()) {
        params.set("search", search.trim());
      } else {
        params.delete("search");
      }
      params.delete("page");
      const qs = params.toString();
      router.push(qs ? `${basePath}?${qs}` : basePath);
    }, 400);
    return () => clearTimeout(timeout);
  }, [search, searchParams, basePath, router]);

  const hasFilters =
    Boolean(searchParams.get("search")) ||
    (activeStatus !== "ALL" && Boolean(searchParams.get("status"))) ||
    (activeScore !== "ALL" && Boolean(searchParams.get("score")));

  return (
    <FilterBar
      hasActiveFilters={hasFilters}
      search={
        <div className="relative w-full sm:w-64 md:w-80 shrink-0">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="candidate-search"
            placeholder="Search candidate name or email..."
            className="pl-8 h-9 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      }
      filters={
        <>
          <NativeSelect
            id="candidate-status"
            value={activeStatus}
            onChange={(e) => setParam("status", e.target.value)}
            className="h-9 text-xs"
            containerClassName="w-full sm:w-fit sm:min-w-[150px] sm:shrink-0"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </NativeSelect>

          <NativeSelect
            id="candidate-score"
            value={activeScore}
            onChange={(e) => setParam("score", e.target.value)}
            className="h-9 text-xs"
            containerClassName="w-full sm:w-fit sm:min-w-[150px] sm:shrink-0"
          >
            {scoreOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </NativeSelect>

          {hasFilters && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                router.push(basePath);
              }}
              className="h-9 gap-1.5 text-xs"
              title="Reset filters"
            >
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          )}
        </>
      }
      actions={actionSlot}
    />
  );
}
