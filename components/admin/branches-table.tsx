"use client";

import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { toggleBranchActive } from "@/lib/modules/branches/actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";

export type BranchRow = {
  id: string;
  name: string;
  location: string;
  isActive: boolean;
  _count: { employees: number };
  avgScore: number | null;
};

const columnHelper = createColumnHelper<typeof dataTableFeatures, BranchRow>();

const columns = columnHelper.columns([
  columnHelper.accessor("name", {
    header: "Branch",
    cell: (info) => (
      <>
        <Link href={`/admin/branches/${info.row.original.id}`} className="font-medium text-foreground hover:underline">
          {info.getValue()}
        </Link>
        <p className="text-xs text-muted-foreground">{info.row.original.location}</p>
      </>
    ),
  }),
  columnHelper.accessor("isActive", {
    header: "Status",
    cell: (info) => <Badge variant={info.getValue() ? "default" : "outline"}>{info.getValue() ? "Active" : "Inactive"}</Badge>,
  }),
  columnHelper.accessor((row) => row._count.employees, {
    id: "employees",
    header: () => <div className="text-right">Employees</div>,
    cell: (info) => <div className="text-right">{info.getValue()}</div>,
  }),
  columnHelper.accessor("avgScore", {
    header: () => <div className="text-right">Avg score</div>,
    cell: (info) => <div className="text-right">{info.getValue() != null ? info.getValue()!.toFixed(1) : "-"}</div>,
  }),
  columnHelper.display({
    id: "actions",
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row }) => (
      <div className="flex justify-end gap-1.5">
        <Link href={`/admin/branches/${row.original.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          View
        </Link>
        <Link href={`/admin/branches/${row.original.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Edit
        </Link>
        <form action={toggleBranchActive}>
          <input type="hidden" name="id" value={row.original.id} />
          <input type="hidden" name="nextIsActive" value={(!row.original.isActive).toString()} />
          <Button size="sm" variant={row.original.isActive ? "destructive" : "secondary"} type="submit">
            {row.original.isActive ? "Deactivate" : "Activate"}
          </Button>
        </form>
      </div>
    ),
  }),
]);

export function BranchesTable({ branches }: { branches: BranchRow[] }) {
  return <DataTable columns={columns} data={branches} />;
}
