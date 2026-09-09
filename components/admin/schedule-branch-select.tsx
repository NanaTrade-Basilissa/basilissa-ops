"use client";

import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";

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
    <div className="space-y-1.5 min-w-48">
      <Label htmlFor="branchSelect">Branch</Label>
      <NativeSelect
        id="branchSelect"
        value={selectedBranchId}
        onChange={(e) => {
          router.replace(`/admin/shifts?tab=schedule&branchId=${e.target.value}&week=${week}`);
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
