"use client";

import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";

export function PolicyBranchSelect({
  branches,
  selectedBranchId,
}: {
  branches: { id: string; name: string }[];
  selectedBranchId: string | null;
}) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-3 pt-1 border-b border-border pb-4">
      <Label htmlFor="policy-branch-select" className="text-xs font-medium text-muted-foreground whitespace-nowrap">
        Policy Scope:
      </Label>
      <NativeSelect
        id="policy-branch-select"
        value={selectedBranchId ?? ""}
        onChange={(e) => {
          const val = e.target.value;
          if (val) {
            router.push(`/admin/attendance/policy?branchId=${val}`);
          } else {
            router.push("/admin/attendance/policy");
          }
        }}
        className="h-9 w-auto min-w-[220px] text-xs"
      >
        <option value="">Global (All branches)</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
