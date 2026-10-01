"use client";

import { Smartphone } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { AUDIENCE_LABELS, type AudienceKind } from "@/lib/modules/announcements/constants";
import { formatSent } from "@/components/admin/announcement-format";

export type AnnouncementRow = {
  id: string;
  title: string;
  createdAt: Date;
  createdByName: string;
  audienceKind: AudienceKind;
  sendPush: boolean;
  recipients: number;
  read: number;
};

const columnHelper = createColumnHelper<typeof dataTableFeatures, AnnouncementRow>();

const columns = columnHelper.columns([
  columnHelper.accessor("title", {
    header: "Announcement",
    cell: (info) => (
      <div className="space-y-0.5">
        <span className="font-medium text-foreground">{info.getValue()}</span>
        <span className="block text-xs text-muted-foreground">
          {formatSent(info.row.original.createdAt)} · {info.row.original.createdByName}
        </span>
      </div>
    ),
  }),
  columnHelper.accessor("audienceKind", {
    header: "Audience",
    cell: (info) => <span className="text-sm">{AUDIENCE_LABELS[info.getValue()].label}</span>,
  }),
  columnHelper.accessor("recipients", {
    header: "Sent to",
    cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
  }),
  columnHelper.accessor("read", {
    header: "Read",
    cell: (info) => {
      const { recipients } = info.row.original;
      const percent = recipients === 0 ? 0 : Math.round((info.getValue() / recipients) * 100);
      return (
        <span className="tabular-nums">
          {info.getValue()} <span className="text-xs text-muted-foreground">({percent}%)</span>
        </span>
      );
    },
  }),
  columnHelper.accessor("sendPush", {
    header: "Delivery",
    cell: (info) =>
      info.getValue() ? (
        <Badge variant="outline" className="gap-1">
          <Smartphone className="size-3" />
          Push
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground">In app only</span>
      ),
  }),
]);

export function AnnouncementsTable({ rows }: { rows: AnnouncementRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowHref={(row) => `/admin/announcements/${row.id}`}
      emptyMessage="Nothing has been sent yet. Announcements you send appear here."
    />
  );
}
