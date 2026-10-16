"use client";

import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";

export function MealsBranchSelect({
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
    <div className="w-full sm:w-48 min-w-0">
      <NativeSelect
        id="mealsBranchSelect"
        value={selectedBranchId}
        onChange={(e) => {
          router.replace(`/admin/meals?branchId=${e.target.value}&week=${week}`);
        }}
      >
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
