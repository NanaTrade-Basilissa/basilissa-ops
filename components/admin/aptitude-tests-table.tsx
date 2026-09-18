"use client";

import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import type { AptitudeTestStatus } from "@prisma/client";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { STATUS_LABEL } from "@/lib/modules/aptitude/constants";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import { TableRowActions } from "@/components/admin/table-row-actions";
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
      <Link
        href={`/admin/aptitude-tests/${info.row.original.id}`}
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
  columnHelper.display({
    id: "actions",
    header: () => <div className="text-right sr-only sm:not-sr-only">Actions</div>,
    cell: ({ row }) => (
      <TableRowActions
        actions={[
          {
            id: "open",
            label: "Open test",
            href: `/admin/aptitude-tests/${row.original.id}`,
            icon: ExternalLink,
          },
        ]}
      />
    ),
  }),
]);

export function AptitudeTestsTable({ tests }: { tests: AptitudeTestRow[] }) {
  return <DataTable columns={columns} data={tests} />;
}
