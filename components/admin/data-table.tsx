"use client";

import { tableFeatures, useTable, FlexRender, type ColumnDef, type RowData } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  emptyMessage = "No results.",
}: {
  columns: ColumnDef<typeof dataTableFeatures, TData>[];
  data: TData[];
  emptyMessage?: string;
}) {
  const table = useTable({ features: dataTableFeatures, columns, data });

  return (
    // Same container treatment as `Card` (rounded-xl, bg-card, a 1px ring
    // rather than a hard border) so a table standing on its own looks like
    // the same design system as one sitting inside a Card — before this, a
    // bare `<Table>` had no background of its own and just showed the
    // page's background through every row, which read as unfinished next
    // to any page that happened to wrap its table in a Card.
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
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
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-32 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
