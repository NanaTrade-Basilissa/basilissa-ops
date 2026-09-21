"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, CopyPlus, Globe, Lock, Pencil, Send, Trash2, Undo2, Unlock, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { AptitudeTestStatus, IdentityFieldMode } from "@prisma/client";
import { TopActionsBar, type TopActionItem } from "@/components/admin/top-actions-bar";
import { AptitudeInviteDialog } from "@/components/admin/aptitude-invite-dialog";
import { AptitudePublicLinkDialog } from "@/components/admin/aptitude-public-link-dialog";
import {
  closeAptitudeTestAction,
  deleteAptitudeTestAction,
  duplicateAptitudeTestAction,
  inviteManyByEmailAction,
  inviteToAptitudeTestAction,
  publishAptitudeTestAction,
  reopenAptitudeTestAction,
  unpublishAptitudeTestAction,
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
  attemptCount = 0,
  publicLinkUrl,
}: {
  test: {
    id: string;
    status: AptitudeTestStatus;
    publicLinkEnabled: boolean;
    publicLinkNameMode: IdentityFieldMode;
    publicLinkEmailMode: IdentityFieldMode;
  };
  attemptCount?: number;
  publicLinkUrl: string | null;
}) {
  const router = useRouter();
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

  const handleUnpublish = () => {
    startTransition(async () => {
      try {
        const res = await unpublishAptitudeTestAction(test.id, undefined, new FormData());
        if (res?.error) {
          toast.error(res.error);
        } else {
          toast.success("Test reverted to draft. Questions and scoring can now be edited.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to unpublish test");
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

  const handleReopen = () => {
    startTransition(async () => {
      try {
        const res = await reopenAptitudeTestAction(test.id, undefined, new FormData());
        if (res?.error) {
          toast.error(res.error);
        } else {
          toast.success("Test reopened successfully");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to reopen test");
      }
    });
  };

  const handleDuplicate = () => {
    startTransition(async () => {
      try {
        const res = await duplicateAptitudeTestAction(test.id, undefined, new FormData());
        if (res?.error) {
          toast.error(res.error);
        } else if (res?.newTestId) {
          toast.success("Test duplicated as draft");
          router.push(`/admin/aptitude-tests/${res.newTestId}`);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to duplicate test");
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

  const primaryAction =
    test.status === "PUBLISHED"
      ? {
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
        }
      : test.status === "DRAFT"
        ? {
            label: "Publish test",
            icon: Send,
            disabled: isPending,
            onClick: handlePublish,
          }
        : {
            label: "Reopen test",
            icon: Unlock,
            dialog: (props: { open: boolean; onOpenChange: (open: boolean) => void }) => (
              <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reopen this aptitude test?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will set the test status back to Published and clear the closed date. Candidates will be able to access the test and submit responses again.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleReopen} disabled={isPending}>
                      Reopen test
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
    test.status === "PUBLISHED" && {
      id: "unpublish",
      label: attemptCount > 0 ? "Revert to draft (attempts exist)" : "Revert to draft",
      icon: Undo2,
      disabled: isPending || attemptCount > 0,
      dialog:
        attemptCount === 0
          ? (props) => (
              <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Revert test to draft?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This test has no candidate attempts yet. Reverting to draft allows you to edit, add, or remove questions, sections, and scoring. While in draft, candidates cannot start or access this test.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleUnpublish} disabled={isPending}>
                      Revert to draft
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )
          : undefined,
    },
    test.status === "PUBLISHED" && {
      id: "close",
      label: "Close test",
      icon: Lock,
      disabled: isPending,
      onClick: handleClose,
    },
    {
      id: "duplicate",
      label: "Duplicate test",
      icon: CopyPlus,
      disabled: isPending,
      dialog: (props) => (
        <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Duplicate this aptitude test?</AlertDialogTitle>
              <AlertDialogDescription>
                This creates an exact copy of this test in Draft status with all sections, questions, and options preserved. Historical candidate attempts on this test will remain untouched.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDuplicate} disabled={isPending}>
                Duplicate test
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ),
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
