"use client";

import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import type { AssessmentStatus } from "@prisma/client";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { STATUS_LABEL } from "@/lib/modules/assessments/constants";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import { TableRowActions } from "@/components/admin/table-row-actions";
import { formatAccraDateTime } from "@/lib/platform/date";

export type AssessmentRow = {
  id: string;
  title: string;
  status: AssessmentStatus;
  showScoreToTaker: boolean;
  createdAt: Date;
  _count: { sections: number; invitations: number };
};

const columnHelper = createColumnHelper<typeof dataTableFeatures, AssessmentRow>();

const columns = columnHelper.columns([
  columnHelper.accessor("title", {
    header: "Title",
    cell: (info) => (
      <Link
        href={`/admin/assessments/${info.row.original.id}`}
        className="font-medium text-foreground underline-offset-4 hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => (
      <Badge variant={info.getValue() === "PUBLISHED" ? "default" : "outline"}>{STATUS_LABEL[info.getValue()]}</Badge>
    ),
  }),
  columnHelper.accessor((row) => row._count.sections, {
    id: "sections",
    header: "Sections",
    cell: (info) => <span className="text-sm">{info.getValue()}</span>,
  }),
  columnHelper.accessor((row) => row._count.invitations, {
    id: "invitations",
    header: "Invited",
    cell: (info) => <span className="text-sm">{info.getValue()}</span>,
  }),
  columnHelper.accessor("showScoreToTaker", {
    header: "Score shown",
    cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue() ? "to the taker" : "HR only"}</span>,
  }),
  columnHelper.accessor("createdAt", {
    header: "Created",
    cell: (info) => <span className="text-sm text-muted-foreground">{formatAccraDateTime(info.getValue())}</span>,
  }),
  columnHelper.display({
    id: "actions",
    header: () => <div className="text-right sr-only sm:not-sr-only">Actions</div>,
    cell: ({ row }) => (
      <TableRowActions
        actions={[
          {
            id: "open",
            label: "Open assessment",
            href: `/admin/assessments/${row.original.id}`,
            icon: ExternalLink,
          },
        ]}
      />
    ),
  }),
]);

export function AssessmentsTable({ assessments }: { assessments: AssessmentRow[] }) {
  return <DataTable columns={columns} data={assessments} />;
}
