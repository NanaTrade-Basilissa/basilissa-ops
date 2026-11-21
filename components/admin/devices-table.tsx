"use client";

import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { DeviceDetailSheet, type DeviceDetail } from "@/components/admin/device-detail-sheet";
import { StatusBadge } from "@/components/admin/status-badge";

export type DeviceRow = DeviceDetail;

const columnHelper = createColumnHelper<typeof dataTableFeatures, DeviceRow>();

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function DevicesTable({
  devices,
  branches,
}: {
  devices: DeviceRow[];
  branches: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState<DeviceRow | null>(null);

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("serialNumber", {
          header: "Serial number",
          cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
        }),
        columnHelper.display({
          id: "label",
          header: "Label",
          cell: ({ row }) =>
            row.original.label ?? <span className="text-xs italic text-muted-foreground">None</span>,
        }),
        columnHelper.accessor("branchName", { header: "Branch" }),
        columnHelper.accessor("isActive", {
          header: "Status",
          cell: (info) => (
            <StatusBadge tone={info.getValue() ? "good" : "neutral"} dot>
              {info.getValue() ? "Active" : "Inactive"}
            </StatusBadge>
          ),
        }),
        columnHelper.display({
          id: "registeredAt",
          header: "Registered",
          cell: ({ row }) => (
            <span className="text-xs tabular-nums text-muted-foreground">
              {new Date(row.original.registeredAt).toLocaleDateString()}
            </span>
          ),
        }),
        columnHelper.display({
          id: "lastSeenAt",
          header: "Last seen",
          cell: ({ row }) =>
            row.original.lastSeenAt ? (
              <span className="text-xs tabular-nums text-muted-foreground">
                {timeAgo(row.original.lastSeenAt)}
              </span>
            ) : (
              <span className="text-xs italic text-muted-foreground">Never</span>
            ),
        }),
      ]),
    [],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={devices}
        ariaLabel="Biometric devices"
        pageSize={20}
        onRowClick={(row) => setSelected(row)}
        emptyMessage="No devices match the selected filters."
      />
      <DeviceDetailSheet
        device={selected}
        branches={branches}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </>
  );
}
