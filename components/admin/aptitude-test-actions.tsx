"use client";

import { useTransition } from "react";
import { Copy, Globe, Lock, Pencil, Send, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { AptitudeTestStatus, IdentityFieldMode } from "@prisma/client";
import { TopActionsBar, type TopActionItem } from "@/components/admin/top-actions-bar";
import { AptitudeInviteDialog } from "@/components/admin/aptitude-invite-dialog";
import { AptitudePublicLinkDialog } from "@/components/admin/aptitude-public-link-dialog";
import {
  closeAptitudeTestAction,
  deleteAptitudeTestAction,
  inviteManyByEmailAction,
  inviteToAptitudeTestAction,
  publishAptitudeTestAction,
  updatePublicLinkAction,
} from "@/lib/modules/aptitude/actions";
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

export function AptitudeTestActions({
  test,
  publicLinkUrl,
}: {
  test: {
    id: string;
    status: AptitudeTestStatus;
    publicLinkEnabled: boolean;
    publicLinkNameMode: IdentityFieldMode;
    publicLinkEmailMode: IdentityFieldMode;
  };
  publicLinkUrl: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  const handleCopyPublicLink = async () => {
    if (!publicLinkUrl) return;
    try {
      await navigator.clipboard.writeText(publicLinkUrl);
      toast.success("Public test link copied to clipboard");
    } catch {
      toast.error("Failed to copy public link");
    }
  };

  const handlePublish = () => {
    startTransition(async () => {
      try {
        const res = await publishAptitudeTestAction(test.id, undefined, new FormData());
        if (res?.error) {
          toast.error(res.error);
        } else {
          toast.success("Test published successfully");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to publish test");
      }
    });
  };

  const handleClose = () => {
    startTransition(async () => {
      try {
        const res = await closeAptitudeTestAction(test.id, undefined, new FormData());
        if (res?.error) {
          toast.error(res.error);
        } else {
          toast.success("Test closed");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to close test");
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      try {
        const res = await deleteAptitudeTestAction(test.id, undefined, new FormData());
        if (res?.error) {
          toast.error(res.error);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete test");
      }
    });
  };

  const primaryAction = {
    label: "Invite candidates",
    icon: UserPlus,
    dialog: (props: { open: boolean; onOpenChange: (open: boolean) => void }) => (
      <AptitudeInviteDialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        trigger={null}
        inviteAction={inviteToAptitudeTestAction.bind(null, test.id)}
        inviteManyAction={inviteManyByEmailAction.bind(null, test.id)}
      />
    ),
  };

  const secondaryActions: (TopActionItem | false | null | undefined)[] = [
    {
      id: "edit",
      label: "Edit test",
      icon: Pencil,
      href: `/admin/aptitude-tests/${test.id}/edit`,
    },
    test.publicLinkEnabled &&
      Boolean(publicLinkUrl) && {
        id: "copy-link",
        label: "Copy public link",
        icon: Copy,
        onClick: handleCopyPublicLink,
      },
    {
      id: "link-settings",
      label: "Public link settings",
      icon: Globe,
      dialog: (props) => (
        <AptitudePublicLinkDialog
          open={props.open}
          onOpenChange={props.onOpenChange}
          trigger={null}
          action={updatePublicLinkAction.bind(null, test.id)}
          linkUrl={publicLinkUrl}
          values={{
            enabled: test.publicLinkEnabled,
            nameMode: test.publicLinkNameMode,
            emailMode: test.publicLinkEmailMode,
          }}
        />
      ),
    },
    test.status === "DRAFT" && {
      id: "publish",
      label: "Publish test",
      icon: Send,
      disabled: isPending,
      onClick: handlePublish,
    },
    test.status === "PUBLISHED" && {
      id: "close",
      label: "Close test",
      icon: Lock,
      disabled: isPending,
      onClick: handleClose,
    },
    test.status !== "PUBLISHED" && {
      id: "delete",
      label: "Delete test",
      icon: Trash2,
      variant: "destructive",
      disabled: isPending,
      dialog: (props) => (
        <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this aptitude test?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. All questions, sections, and associated draft data will be permanently removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete test
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ),
    },
  ];

  return (
    <TopActionsBar
      primaryAction={primaryAction}
      secondaryActions={secondaryActions}
    />
  );
}
