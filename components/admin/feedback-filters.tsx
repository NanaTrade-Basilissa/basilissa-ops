"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { RotateCcw, Search } from "lucide-react";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RATING_SCALE } from "@/lib/modules/feedback/constants";
import { FilterBar } from "@/components/admin/filter-bar";

type FilterOption = { id: string; label: string };

const FILTER_KEYS = ["search", "branchId", "from", "to", "rating"];

export function FeedbackFilters({ branches }: { branches: FilterOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentSearch = searchParams.get("search") ?? "";
  const [searchInput, setSearchInput] = useState(currentSearch);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setParam("search", searchInput.trim());
  }

  const hasFilters = FILTER_KEYS.some((key) => searchParams.get(key));

  return (
    <FilterBar
      hasActiveFilters={hasFilters}
      search={
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-64 md:w-72 shrink-0">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search submission ID or branch..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-8 h-9"
          />
        </form>
      }
      filters={
        <>
          <NativeSelect
            value={searchParams.get("branchId") ?? ""}
            onChange={(e) => setParam("branchId", e.target.value)}
            containerClassName="w-full sm:w-fit sm:min-w-[150px] sm:shrink-0"
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </NativeSelect>

          <NativeSelect
            value={searchParams.get("rating") ?? ""}
            onChange={(e) => setParam("rating", e.target.value)}
            containerClassName="w-full sm:w-fit sm:min-w-[140px] sm:shrink-0"
          >
            <option value="">All ratings</option>
            {[...RATING_SCALE].reverse().map((r) => (
              <option key={r.value} value={r.value}>
                {r.value} - {r.label}
              </option>
            ))}
          </NativeSelect>

          <div className="flex items-center gap-1.5 sm:shrink-0">
            <Input
              type="date"
              value={searchParams.get("from") ?? ""}
              onChange={(e) => setParam("from", e.target.value)}
              className="h-9 flex-1 min-w-0 px-2.5 text-xs sm:w-[150px] sm:flex-none"
              title="From date"
            />
            <span className="text-muted-foreground text-xs shrink-0">to</span>
            <Input
              type="date"
              value={searchParams.get("to") ?? ""}
              onChange={(e) => setParam("to", e.target.value)}
              className="h-9 flex-1 min-w-0 px-2.5 text-xs sm:w-[150px] sm:flex-none"
              title="To date"
            />
          </div>

          {hasFilters && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => {
                setSearchInput("");
                router.push(pathname);
              }}
              title="Reset filters"
            >
              <RotateCcw className="size-3.5 mr-1" />
              Reset
            </Button>
          )}
        </>
      }
    />
  );
}
