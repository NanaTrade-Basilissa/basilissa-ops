"use client";

import { BarChart2, Ban, CheckCircle2, Pencil, QrCode, Settings } from "lucide-react";
import { TopActionsBar, type TopActionItem } from "@/components/admin/top-actions-bar";
import { BranchDialog } from "@/components/admin/branch-dialog";
import { BranchQrDialog } from "@/components/admin/branch-qr-button";
import { updateBranch, toggleBranchActive } from "@/lib/modules/branches/actions";
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

export interface BranchTopActionsProps {
  branch: {
    id: string;
    name: string;
    slug: string;
    location: string;
    isActive: boolean;
    latitude: number | null;
    longitude: number | null;
    geofenceRadiusMeters: number;
    geofenceEnabled: boolean;
  };
  canWrite: boolean;
  feedbackUrl: string;
  currentPage?: "details" | "settings";
}

export function BranchTopActions({
  branch,
  canWrite,
  feedbackUrl,
  currentPage = "details",
}: BranchTopActionsProps) {
  const isDetails = currentPage === "details";

  const editDialogAction = {
    label: isDetails ? "Edit branch" : "Edit details",
    icon: Pencil,
    dialog: (props: { open: boolean; onOpenChange: (open: boolean) => void }) => (
      <BranchDialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        action={updateBranch.bind(null, branch.id)}
        submitLabel="Save changes"
        title={isDetails ? "Edit branch" : "Edit branch profile"}
        description="Changing the slug also changes this branch's feedback QR code link."
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
  };

  const qrAction: TopActionItem = {
    id: "qr",
    label: "Feedback QR code",
    icon: QrCode,
    dialog: (props) => (
      <BranchQrDialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        branchId={branch.id}
        branchName={branch.name}
        feedbackUrl={feedbackUrl}
        trigger={null}
      />
    ),
  };

  const toggleActiveAction: TopActionItem = {
    id: "toggle-active",
    label: branch.isActive ? "Deactivate branch" : "Activate branch",
    icon: branch.isActive ? Ban : CheckCircle2,
    variant: branch.isActive ? "destructive" : "default",
    dialog: (props) => (
      <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {branch.isActive ? `Deactivate ${branch.name}?` : `Activate ${branch.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {branch.isActive
                ? "This branch will immediately stop accepting new feedback submissions and will be marked inactive."
                : "This branch will be marked active and resume accepting feedback submissions."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form action={toggleBranchActive}>
              <input type="hidden" name="id" value={branch.id} />
              <input type="hidden" name="nextIsActive" value={(!branch.isActive).toString()} />
              <AlertDialogAction
                type="submit"
                className={branch.isActive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              >
                {branch.isActive ? "Deactivate" : "Activate"}
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
  };

  if (isDetails) {
    if (canWrite) {
      return (
        <TopActionsBar
          primaryAction={editDialogAction}
          secondaryActions={[
            {
              id: "settings",
              label: "Branch settings",
              icon: Settings,
              href: `/admin/branches/${branch.id}/settings`,
            },
            qrAction,
            toggleActiveAction,
          ]}
        />
      );
    }

    return (
      <TopActionsBar
        primaryAction={{
          label: "Feedback QR code",
          icon: QrCode,
          dialog: (props) => (
            <BranchQrDialog
              open={props.open}
              onOpenChange={props.onOpenChange}
              branchId={branch.id}
              branchName={branch.name}
              feedbackUrl={feedbackUrl}
              trigger={null}
            />
          ),
        }}
        secondaryActions={[
          {
            id: "settings",
            label: "Branch settings",
            icon: Settings,
            href: `/admin/branches/${branch.id}/settings`,
          },
        ]}
      />
    );
  }

  // Settings page
  if (canWrite) {
    return (
      <TopActionsBar
        primaryAction={editDialogAction}
        secondaryActions={[
          {
            id: "analytics",
            label: "View analytics",
            icon: BarChart2,
            href: `/admin/branches/${branch.id}`,
          },
          qrAction,
          toggleActiveAction,
        ]}
      />
    );
  }

  return (
    <TopActionsBar
      primaryAction={{
        label: "View analytics",
        icon: BarChart2,
        href: `/admin/branches/${branch.id}`,
      }}
      secondaryActions={[qrAction]}
    />
  );
}
