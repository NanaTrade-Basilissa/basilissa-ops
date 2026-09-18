"use client";

import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { Badge, ratingBadgeVariant } from "@/components/ui/badge";
import { formatAccraDateTime } from "@/lib/platform/date";

export type FeedbackRow = {
  id: string;
  submittedAt: Date;
  overallScore: number;
  branch: { id: string; name: string };
};

const columnHelper = createColumnHelper<typeof dataTableFeatures, FeedbackRow>();

const columns = columnHelper.columns([
  columnHelper.accessor("id", {
    header: "Submission ID",
    cell: (info) => <span className="font-mono text-xs text-muted-foreground">{info.getValue()}</span>,
  }),
  columnHelper.accessor("submittedAt", {
    header: "Submitted",
    cell: (info) => <span className="text-muted-foreground">{formatAccraDateTime(info.getValue())}</span>,
  }),
  columnHelper.display({
    id: "branch",
    header: "Branch",
    cell: ({ row }) => (
      <Link
        href={`/admin/branches/${row.original.branch.id}`}
        className="font-medium text-foreground underline-offset-4 hover:underline cursor-pointer text-left"
      >
        {row.original.branch.name}
      </Link>
    ),
  }),
  columnHelper.accessor("overallScore", {
    header: () => <div className="text-right">Overall</div>,
    cell: (info) => (
      <div className="text-right">
        <Badge variant={ratingBadgeVariant(Math.round(info.getValue()))}>{info.getValue().toFixed(1)}</Badge>
      </div>
    ),
  }),
]);

export function FeedbackTable({ submissions }: { submissions: FeedbackRow[] }) {
  return <DataTable columns={columns} data={submissions} emptyMessage="No submissions match the selected filters." />;
}
