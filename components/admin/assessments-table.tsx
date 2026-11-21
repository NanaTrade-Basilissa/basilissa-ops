"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { AssessmentStatus } from "@prisma/client";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { STATUS_LABEL } from "@/lib/modules/assessments/constants";
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
      <span className="font-medium text-foreground">
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const s = info.getValue();
      const tone = s === "PUBLISHED" ? "good" : s === "DRAFT" ? "warning" : "neutral";
      return <StatusBadge tone={tone}>{STATUS_LABEL[s]}</StatusBadge>;
    },
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
]);

export function AssessmentsTable({ assessments }: { assessments: AssessmentRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={assessments}
      getRowHref={(row) => `/admin/assessments/${row.id}`}
    />
  );
}
