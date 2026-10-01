"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { formatSent } from "@/components/admin/announcement-format";

export type RecipientTableRow = {
  employeeId: string;
  name: string;
  employeeCode: string;
  read: boolean;
  readAt: Date | null;
  pushStatus: string;
  pushError: string | null;
  smsStatus: string;
  smsError: string | null;
  emailStatus: string;
  emailError: string | null;
  acknowledgedAt: Date | null;
};

const PUSH_LABELS: Record<string, { label: string; className: string }> = {
  SENT: { label: "Sent", className: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  PENDING: { label: "Sending", className: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  FAILED: { label: "Failed", className: "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300" },
  UNREACHABLE: { label: "No device", className: "text-muted-foreground" },
};

/** The same states for SMS and email, where "unreachable" means no number or address on file. */
const CONTACT_LABELS: Record<string, { label: string; className: string }> = {
  ...PUSH_LABELS,
  UNREACHABLE: { label: "None on file", className: "text-muted-foreground" },
};

const columnHelper = createColumnHelper<typeof dataTableFeatures, RecipientTableRow>();

export function AnnouncementRecipientsTable({
  rows,
  showPush,
  showSms,
  showEmail,
  showAck,
}: {
  rows: RecipientTableRow[];
  showPush: boolean;
  showSms: boolean;
  showEmail: boolean;
  showAck: boolean;
}) {
  const columns = columnHelper.columns([
    columnHelper.accessor("name", {
      header: "Employee",
      cell: (info) => (
        <div className="space-y-0.5">
          <span className="font-medium text-foreground">{info.getValue()}</span>
          <span className="block text-xs text-muted-foreground">{info.row.original.employeeCode}</span>
        </div>
      ),
    }),
    columnHelper.accessor("read", {
      header: "Read",
      cell: (info) =>
        info.getValue() ? (
          <span className="text-sm">
            Read <span className="text-xs text-muted-foreground">{info.row.original.readAt && formatSent(info.row.original.readAt)}</span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Not yet</span>
        ),
    }),
    ...(showAck
      ? [
          columnHelper.accessor("acknowledgedAt", {
            header: "Confirmed",
            cell: (info) =>
              info.getValue() ? (
                <span className="text-sm">
                  Yes <span className="text-xs text-muted-foreground">{formatSent(info.getValue()!)}</span>
                </span>
              ) : (
                <span className="text-sm text-amber-700 dark:text-amber-300">Not yet</span>
              ),
          }),
        ]
      : []),
    ...(showPush
      ? [
          columnHelper.accessor("pushStatus", {
            header: "Push",
            cell: (info) => {
              const meta = PUSH_LABELS[info.getValue()];
              if (!meta) return <span className="text-xs text-muted-foreground">-</span>;
              return (
                <Badge variant="outline" className={meta.className} title={info.row.original.pushError ?? undefined}>
                  {meta.label}
                </Badge>
              );
            },
          }),
        ]
      : []),
    ...(showSms
      ? [
          columnHelper.accessor("smsStatus", {
            header: "SMS",
            cell: (info) => {
              const meta = CONTACT_LABELS[info.getValue()];
              if (!meta) return <span className="text-xs text-muted-foreground">-</span>;
              return (
                <Badge variant="outline" className={meta.className} title={info.row.original.smsError ?? undefined}>
                  {meta.label}
                </Badge>
              );
            },
          }),
        ]
      : []),
    ...(showEmail
      ? [
          columnHelper.accessor("emailStatus", {
            header: "Email",
            cell: (info) => {
              const meta = CONTACT_LABELS[info.getValue()];
              if (!meta) return <span className="text-xs text-muted-foreground">-</span>;
              return (
                <Badge variant="outline" className={meta.className} title={info.row.original.emailError ?? undefined}>
                  {meta.label}
                </Badge>
              );
            },
          }),
        ]
      : []),
  ]);

  return <DataTable columns={columns} data={rows} emptyMessage="No recipients." />;
}
