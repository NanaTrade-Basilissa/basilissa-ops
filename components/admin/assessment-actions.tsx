"use client";

import { useTransition } from "react";
import { Copy, Globe, Lock, Pencil, Send, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { AssessmentStatus, IdentityFieldMode } from "@prisma/client";
import { TopActionsBar, type TopActionItem } from "@/components/admin/top-actions-bar";
import { AssessmentInviteDialog } from "@/components/admin/assessment-invite-dialog";
import { AssessmentPublicLinkDialog } from "@/components/admin/assessment-public-link-dialog";
import {
  closeAssessmentAction,
  deleteAssessmentAction,
  inviteManyToAssessmentAction,
  inviteToAssessmentAction,
  publishAssessmentAction,
  updatePublicLinkAction,
} from "@/lib/modules/assessments/actions";
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

export function AssessmentActions({
  assessment,
  employees,
  invitations,
  publicLinkUrl,
}: {
  assessment: {
    id: string;
    status: AssessmentStatus;
    publicLinkEnabled: boolean;
    publicLinkNameMode: IdentityFieldMode;
    publicLinkEmailMode: IdentityFieldMode;
  };
  employees: { id: string; label: string }[];
  invitations: { employeeId: string | null; revokedAt: Date | null; response: { submittedAt: Date | null } | null }[];
  publicLinkUrl: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  const handleCopyPublicLink = async () => {
    if (!publicLinkUrl) return;
    try {
      await navigator.clipboard.writeText(publicLinkUrl);
      toast.success("Public assessment link copied to clipboard");
    } catch {
      toast.error("Failed to copy public link");
    }
  };

  const handlePublish = () => {
    startTransition(async () => {
      try {
        const res = await publishAssessmentAction(assessment.id, undefined, new FormData());
        if (res?.error) {
          toast.error(res.error);
        } else {
          toast.success("Assessment published successfully");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to publish assessment");
      }
    });
  };

  const handleClose = () => {
    startTransition(async () => {
      try {
        const res = await closeAssessmentAction(assessment.id, undefined, new FormData());
        if (res?.error) {
          toast.error(res.error);
        } else {
          toast.success("Assessment closed");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to close assessment");
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      try {
        const res = await deleteAssessmentAction(assessment.id, undefined, new FormData());
        if (res?.error) {
          toast.error(res.error);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete assessment");
      }
    });
  };

  const primaryAction = {
    label: "Invite staff",
    icon: UserPlus,
    dialog: (props: { open: boolean; onOpenChange: (open: boolean) => void }) => (
      <AssessmentInviteDialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        trigger={null}
        employees={employees}
        invitations={invitations}
        inviteAction={inviteToAssessmentAction.bind(null, assessment.id)}
        inviteManyAction={inviteManyToAssessmentAction.bind(null, assessment.id)}
      />
    ),
  };

  const secondaryActions: (TopActionItem | false | null | undefined)[] = [
    {
      id: "edit",
      label: "Edit assessment",
      icon: Pencil,
      href: `/admin/assessments/${assessment.id}/edit`,
    },
    assessment.publicLinkEnabled &&
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
        <AssessmentPublicLinkDialog
          open={props.open}
          onOpenChange={props.onOpenChange}
          trigger={null}
          action={updatePublicLinkAction.bind(null, assessment.id)}
          linkUrl={publicLinkUrl}
          values={{
            enabled: assessment.publicLinkEnabled,
            nameMode: assessment.publicLinkNameMode,
            emailMode: assessment.publicLinkEmailMode,
          }}
        />
      ),
    },
    assessment.status === "DRAFT" && {
      id: "publish",
      label: "Publish assessment",
      icon: Send,
      disabled: isPending,
      onClick: handlePublish,
    },
    assessment.status === "PUBLISHED" && {
      id: "close",
      label: "Close assessment",
      icon: Lock,
      disabled: isPending,
      onClick: handleClose,
    },
    assessment.status !== "PUBLISHED" && {
      id: "delete",
      label: "Delete assessment",
      icon: Trash2,
      variant: "destructive",
      disabled: isPending,
      dialog: (props) => (
        <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this assessment?</AlertDialogTitle>
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
                Delete assessment
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
