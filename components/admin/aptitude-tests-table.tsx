"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { AptitudeTestStatus } from "@prisma/client";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { STATUS_LABEL } from "@/lib/modules/aptitude/constants";
import { Badge } from "@/components/ui/badge";
import { formatAccraDateTime } from "@/lib/platform/date";

export type AptitudeTestRow = {
  id: string;
  title: string;
  status: AptitudeTestStatus;
  timeLimitMinutes: number | null;
  createdAt: Date;
  _count: { sections: number; invitations: number };
};

const columnHelper = createColumnHelper<typeof dataTableFeatures, AptitudeTestRow>();

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
  columnHelper.accessor("timeLimitMinutes", {
    header: "Timer",
    cell: (info) => (
      <span className="text-sm text-muted-foreground">{info.getValue() ? `${info.getValue()} min` : "untimed"}</span>
    ),
  }),
  columnHelper.accessor("createdAt", {
    header: "Created",
    cell: (info) => <span className="text-sm text-muted-foreground">{formatAccraDateTime(info.getValue())}</span>,
  }),
]);

export function AptitudeTestsTable({ tests }: { tests: AptitudeTestRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={tests}
      getRowHref={(row) => `/admin/aptitude-tests/${row.id}`}
    />
  );
}
