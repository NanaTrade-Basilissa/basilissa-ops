"use client";

import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { toggleBranchActive, updateBranch } from "@/lib/modules/branches/actions";
import { BranchDialog } from "@/components/admin/branch-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export type BranchRow = {
  id: string;
  name: string;
  slug: string;
  location: string;
  isActive: boolean;
  latitude?: number | null;
  longitude?: number | null;
  geofenceRadiusMeters?: number;
  geofenceEnabled?: boolean;
  canWrite?: boolean;
  _count: { employees: number };
  avgScore: number | null;
};

const columnHelper = createColumnHelper<typeof dataTableFeatures, BranchRow>();

const columns = columnHelper.columns([
  columnHelper.accessor("name", {
    header: "Branch",
    cell: (info) => (
      <>
        <Link href={`/admin/branches/${info.row.original.id}`} className="font-medium text-foreground hover:underline">
          {info.getValue()}
        </Link>
        <p className="text-xs text-muted-foreground">{info.row.original.location}</p>
      </>
    ),
  }),
  columnHelper.accessor("isActive", {
    header: "Status",
    cell: (info) => <Badge variant={info.getValue() ? "default" : "outline"}>{info.getValue() ? "Active" : "Inactive"}</Badge>,
  }),
  columnHelper.accessor((row) => row._count.employees, {
    id: "employees",
    header: () => <div className="text-right">Employees</div>,
    cell: (info) => <div className="text-right">{info.getValue()}</div>,
  }),
  columnHelper.accessor("avgScore", {
    header: () => <div className="text-right">Avg score</div>,
    cell: (info) => <div className="text-right">{info.getValue() != null ? info.getValue()!.toFixed(1) : "-"}</div>,
  }),
  columnHelper.display({
    id: "actions",
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row }) => (
      <div className="flex justify-end gap-1.5">
        <Link href={`/admin/branches/${row.original.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          View
        </Link>
        {row.original.canWrite !== false && (
          <>
            <BranchDialog
              action={updateBranch.bind(null, row.original.id)}
              submitLabel="Save changes"
              title="Edit branch"
              description="Changing the slug also changes this branch's QR code link."
              defaultValues={{
                name: row.original.name,
                slug: row.original.slug,
                location: row.original.location,
                isActive: row.original.isActive,
                latitude: row.original.latitude,
                longitude: row.original.longitude,
                geofenceRadiusMeters: row.original.geofenceRadiusMeters,
                geofenceEnabled: row.original.geofenceEnabled,
              }}
              trigger={
                <Button variant="outline" size="sm">
                  Edit
                </Button>
              }
            />
            {row.original.isActive ? (
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button size="sm" variant="destructive">
                      Deactivate
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Deactivate {row.original.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This branch will immediately stop accepting new feedback submissions and will be marked inactive.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <form action={toggleBranchActive}>
                      <input type="hidden" name="id" value={row.original.id} />
                      <input type="hidden" name="nextIsActive" value="false" />
                      <AlertDialogAction
                        type="submit"
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Deactivate branch
                      </AlertDialogAction>
                    </form>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <form action={toggleBranchActive}>
                <input type="hidden" name="id" value={row.original.id} />
                <input type="hidden" name="nextIsActive" value="true" />
                <Button size="sm" variant="secondary" type="submit">
                  Activate
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    ),
  }),
]);

export function BranchesTable({ branches }: { branches: BranchRow[] }) {
  return <DataTable columns={columns} data={branches} />;
}
