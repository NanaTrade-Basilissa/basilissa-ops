"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RATING_SCALE } from "@/lib/modules/feedback/constants";

type FilterOption = { id: string; label: string };

export function DashboardFilters({
  branches,
  questions,
  isScoped = false,
}: {
  branches: FilterOption[];
  questions: FilterOption[];
  isScoped?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const hasFilters = ["branchId", "from", "to", "rating", "questionId"].some((key) =>
    searchParams.get(key),
  );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {branches.length === 1 ? (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Branch</Label>
          <div className="flex h-9 items-center truncate rounded-md border border-input bg-muted/40 px-3 text-sm font-medium text-foreground">
            {branches[0].label}
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="filter-branch" className="text-xs text-muted-foreground">
            Branch
          </Label>
          <NativeSelect
            id="filter-branch"
            value={searchParams.get("branchId") ?? ""}
            onChange={(e) => setParam("branchId", e.target.value)}
          >
            <option value="">{isScoped ? "All assigned branches" : "All branches"}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="filter-rating" className="text-xs text-muted-foreground">
          Rating
        </Label>
        <NativeSelect
          id="filter-rating"
          value={searchParams.get("rating") ?? ""}
          onChange={(e) => setParam("rating", e.target.value)}
        >
          <option value="">All ratings</option>
          {[...RATING_SCALE].reverse().map((r) => (
            <option key={r.value} value={r.value}>
              {r.value} - {r.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-question" className="text-xs text-muted-foreground">
          Question
        </Label>
        <NativeSelect
          id="filter-question"
          value={searchParams.get("questionId") ?? ""}
          onChange={(e) => setParam("questionId", e.target.value)}
        >
          <option value="">All questions</option>
          {questions.map((q) => (
            <option key={q.id} value={q.id}>
              {q.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-from" className="text-xs text-muted-foreground">
          From
        </Label>
        <Input
          id="filter-from"
          type="date"
          value={searchParams.get("from") ?? ""}
          onChange={(e) => setParam("from", e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-to" className="text-xs text-muted-foreground">
          To
        </Label>
        <Input
          id="filter-to"
          type="date"
          value={searchParams.get("to") ?? ""}
          onChange={(e) => setParam("to", e.target.value)}
        />
      </div>

      <div className="flex items-end">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={!hasFilters}
          onClick={() => router.push(pathname)}
        >
          <RotateCcw className="size-4" />
          Reset
        </Button>
      </div>
    </div>
  );
}
