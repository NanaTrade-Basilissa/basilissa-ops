"use client";

import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";

export function ScheduleBranchSelect({
  branches,
  selectedBranchId,
  week,
}: {
  branches: { id: string; name: string }[];
  selectedBranchId: string;
  week: string;
}) {
  const router = useRouter();

  return (
    <NativeSelect
      id="branchSelect"
      aria-label="Select branch"
      value={selectedBranchId}
      onChange={(e) => {
        router.replace(`/admin/shifts?tab=schedule&branchId=${e.target.value}&week=${week}`, { scroll: false });
      }}
      className="h-9 text-xs"
      containerClassName="w-full sm:w-fit sm:min-w-[170px] sm:shrink-0"
    >
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </NativeSelect>
  );
}
