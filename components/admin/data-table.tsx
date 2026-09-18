"use client";

import * as React from "react";
import { SearchX } from "lucide-react";
import { useRouter } from "next/navigation";
import { tableFeatures, useTable, FlexRender, type ColumnDef, type RowData } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle, EmptyContent } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

/**
 * No client-side sorting/filtering/pagination features registered —
 * deliberately. Every admin list here is scoped, filtered and paginated on
 * the server (branch scoping, `?page=`/`?search=` query params, Prisma
 * `skip`/`take`), and TanStack Table would otherwise re-slice or re-sort
 * data that is already exactly one page of already-scoped rows. This is
 * v9's real API (`tableFeatures`/`useTable`), not the deprecated
 * `useLegacyTable` v8 shim — just with an empty feature set, so it does
 * nothing but turn `columns` + one page of `data` into a rendered table.
 */
export const dataTableFeatures = tableFeatures({});

export function DataTable<TData extends RowData>({
  columns,
  data,
  emptyMessage = "No results found.",
  emptyAction,
  onRowClick,
  getRowHref,
}: {
  columns: ColumnDef<typeof dataTableFeatures, TData>[];
  data: TData[];
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
  onRowClick?: (row: TData) => void;
  getRowHref?: (row: TData) => string;
}) {
  const router = useRouter();
  const table = useTable({ features: dataTableFeatures, columns, data });
  const isClickable = Boolean(onRowClick || getRowHref);

  const handleRowClick = (e: React.MouseEvent, rowData: TData) => {
    // If click originated inside an interactive element, do not trigger row navigation
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, a, input, select, textarea, [role='menuitem'], [data-prevent-row-click]")) {
      return;
    }

    if (onRowClick) {
      onRowClick(rowData);
    } else if (getRowHref) {
      router.push(getRowHref(rowData));
    }
  };

  return (
    // Same container treatment as `Card` (rounded-xl, bg-card, a 1px ring
    // rather than a hard border) so a table standing on its own looks like
    // the same design system as one sitting inside a Card.
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="bg-muted/40 hover:bg-muted/40">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} colSpan={header.colSpan}>
                  {header.isPlaceholder ? null : <FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={isClickable ? (e) => handleRowClick(e, row.original) : undefined}
                className={cn(
                  isClickable && "cursor-pointer hover:bg-muted/30 transition-colors",
                )}
              >
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="p-0">
                <Empty className="border-0 py-10">
                  <EmptyMedia variant="icon">
                    <SearchX className="size-4" />
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyTitle>No records</EmptyTitle>
                    <EmptyDescription>{emptyMessage}</EmptyDescription>
                  </EmptyHeader>
                  {emptyAction && <EmptyContent>{emptyAction}</EmptyContent>}
                </Empty>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

