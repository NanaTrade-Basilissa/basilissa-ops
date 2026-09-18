"use client";

import Link from "next/link";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable, dataTableFeatures } from "@/components/admin/data-table";
import { toggleBranchActive, updateBranch } from "@/lib/modules/branches/actions";
import { BranchDialog } from "@/components/admin/branch-dialog";
import { Badge } from "@/components/ui/badge";
import { Eye, Edit2, Ban, CheckCircle2 } from "lucide-react";
import { TableRowActions } from "@/components/admin/table-row-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
      <div>
        <Link
          href={`/admin/branches/${info.row.original.id}`}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {info.getValue()}
        </Link>
        <p className="text-xs text-muted-foreground">{info.row.original.location}</p>
      </div>
    ),
  }),
  columnHelper.accessor("isActive", {
    header: "Status",
    cell: (info) => <Badge variant={info.getValue() ? "default" : "outline"}>{info.getValue() ? "Active" : "Inactive"}</Badge>,
  }),
  columnHelper.accessor("geofenceEnabled", {
    header: "Geofence",
    cell: ({ row }) => {
      const { geofenceEnabled, latitude, longitude, geofenceRadiusMeters } = row.original;
      if (geofenceEnabled) {
        return (
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium">
            {geofenceRadiusMeters ?? 150}m Enforced
          </Badge>
        );
      }
      if (latitude != null && longitude != null) {
        return (
          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 text-xs">
            Disabled
          </Badge>
        );
      }
      return <span className="text-xs text-muted-foreground">—</span>;
    },
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
    header: () => <div className="text-right sr-only sm:not-sr-only">Actions</div>,
    cell: ({ row }) => {
      const branch = row.original;
      const canWrite = branch.canWrite !== false;

      return (
        <TableRowActions
          actions={[
            {
              id: "view",
              label: "View branch",
              href: `/admin/branches/${branch.id}`,
              icon: Eye,
            },
            canWrite && {
              id: "edit",
              label: "Edit branch",
              icon: Edit2,
              dialog: (props) => (
                <BranchDialog
                  open={props.open}
                  onOpenChange={props.onOpenChange}
                  action={updateBranch.bind(null, branch.id)}
                  submitLabel="Save changes"
                  title="Edit branch"
                  description="Changing the slug also changes this branch's QR code link."
                  defaultValues={{
                    name: branch.name,
                    slug: branch.slug,
                    location: branch.location,
                    isActive: branch.isActive,
                    latitude: branch.latitude,
                    longitude: branch.longitude,
                    geofenceRadiusMeters: branch.geofenceRadiusMeters,
                    geofenceEnabled: branch.geofenceEnabled,
                  }}
                />
              ),
            },
            canWrite && branch.isActive && {
              id: "deactivate",
              label: "Deactivate",
              icon: Ban,
              variant: "destructive",
              dialog: (props) => (
                <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Deactivate {branch.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This branch will immediately stop accepting new feedback submissions and will be marked inactive.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <form action={toggleBranchActive}>
                        <input type="hidden" name="id" value={branch.id} />
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
              ),
            },
            canWrite && !branch.isActive && {
              id: "activate",
              label: "Activate",
              icon: CheckCircle2,
              onClick: async () => {
                const formData = new FormData();
                formData.append("id", branch.id);
                formData.append("nextIsActive", "true");
                await toggleBranchActive(formData);
              },
            },
          ]}
        />
      );
    },
  }),
]);

export function BranchesTable({ branches }: { branches: BranchRow[] }) {
  return <DataTable columns={columns} data={branches} />;
}
