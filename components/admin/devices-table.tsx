"use client";

import { useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { DeviceDetailSheet, type DeviceDetail } from "@/components/admin/device-detail-sheet";
import { Badge } from "@/components/ui/badge";

export type DeviceRow = DeviceDetail;

const columnHelper = createColumnHelper<typeof dataTableFeatures, DeviceRow>();

const columns = columnHelper.columns([
  columnHelper.accessor("serialNumber", {
    header: "Serial number",
    cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
  }),
  columnHelper.display({
    id: "label",
    header: "Label",
    cell: ({ row }) =>
      row.original.label ?? <span className="text-sm text-muted-foreground italic">none</span>,
  }),
  columnHelper.accessor("branchName", { header: "Branch" }),
  columnHelper.accessor("isActive", {
    header: "Status",
    cell: (info) => (
      <Badge variant={info.getValue() ? "default" : "outline"}>
        {info.getValue() ? "active" : "inactive"}
      </Badge>
    ),
  }),
  columnHelper.display({
    id: "registeredAt",
    header: "Registered",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {new Date(row.original.registeredAt).toLocaleDateString()}
      </span>
    ),
  }),
]);

export function DevicesTable({
  devices,
  branches,
}: {
  devices: DeviceRow[];
  branches: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState<DeviceRow | null>(null);

  return (
    <>
      <DataTable
        columns={columns}
        data={devices}
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
