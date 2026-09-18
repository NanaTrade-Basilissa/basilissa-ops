"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { RotateCcw, Search } from "lucide-react";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/admin/filter-bar";

type FilterOption = { id: string; label: string };

const FILTER_KEYS = ["branchId", "status", "search"];
const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "TERMINATED", label: "Terminated" },
];

export function EmployeeFilters({
  branches,
  actionSlot,
}: {
  branches: FilterOption[];
  actionSlot?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  // Debounced: a search box that navigates on every keystroke lags and
  // spams history, unlike the selects below which act instantly.
  useEffect(() => {
    const current = searchParams.get("search") ?? "";
    if (search === current) return;
    const timeout = setTimeout(() => setParam("search", search), 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasFilters = FILTER_KEYS.some((key) => searchParams.get(key));

  return (
    <FilterBar
      hasActiveFilters={hasFilters}
      search={
        <div className="relative w-full sm:w-64 md:w-72 shrink-0">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="filter-search"
            placeholder="Search name, code, email..."
            className="pl-8 h-9 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      }
      filters={
        <>
          <NativeSelect
            id="filter-branch"
            value={searchParams.get("branchId") ?? ""}
            onChange={(e) => setParam("branchId", e.target.value)}
            className="h-9 text-xs"
            containerClassName="w-full sm:w-fit sm:min-w-[140px] sm:shrink-0"
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </NativeSelect>

          <NativeSelect
            id="filter-status"
            value={searchParams.get("status") ?? ""}
            onChange={(e) => setParam("status", e.target.value)}
            className="h-9 text-xs"
            containerClassName="w-full sm:w-fit sm:min-w-[130px] sm:shrink-0"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
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
                router.push(pathname);
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
