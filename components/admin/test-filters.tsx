"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { RotateCcw, Search } from "lucide-react";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function TestFilters({
  searchPlaceholder = "Search title...",
}: {
  searchPlaceholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentSearch = searchParams.get("search") ?? "";
  const currentStatus = searchParams.get("status") ?? "";
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

  const hasFilters = Boolean(currentSearch || currentStatus);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-64 md:w-72 shrink-0">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-8 h-9"
        />
      </form>

      <div className="w-auto min-w-[140px]">
        <NativeSelect
          value={currentStatus}
          onChange={(e) => setParam("status", e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="CLOSED">Closed</option>
        </NativeSelect>
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
    </div>
  );
}
