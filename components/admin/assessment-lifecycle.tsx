"use client";

import { useActionState } from "react";
import { Loader2, Lock, Send, Trash2 } from "lucide-react";
import type { AssessmentStatus } from "@prisma/client";
import type { AssessmentFormState } from "@/lib/modules/assessments/actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

export function AssessmentLifecycle({
  status,
  publishAction,
  closeAction,
  deleteAction,
}: {
  status: AssessmentStatus;
  publishAction: (prev: AssessmentFormState, formData: FormData) => Promise<AssessmentFormState>;
  closeAction: (prev: AssessmentFormState, formData: FormData) => Promise<AssessmentFormState>;
  deleteAction: (prev: AssessmentFormState, formData: FormData) => Promise<AssessmentFormState>;
}) {
  const [publishState, publish, publishing] = useActionState<AssessmentFormState, FormData>(
    publishAction,
    undefined,
  );
  const [closeState, close, closing] = useActionState<AssessmentFormState, FormData>(
    closeAction,
    undefined,
  );
  const [deleteState, deleteAssessment, deleting] = useActionState<AssessmentFormState, FormData>(
    deleteAction,
    undefined,
  );

  return (
    <div className="space-y-2">
      {(publishState?.error || closeState?.error || deleteState?.error) && (
        <Alert variant="destructive" className="max-w-sm">
          <AlertDescription>
            {publishState?.error ?? closeState?.error ?? deleteState?.error}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        {status === "DRAFT" && (
          <form action={publish}>
            <Button type="submit" size="sm" disabled={publishing}>
              {publishing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Publish
            </Button>
          </form>
        )}

        {status === "PUBLISHED" && (
          <form action={close}>
            <Button type="submit" size="sm" variant="outline" disabled={closing}>
              {closing ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
              Close
            </Button>
          </form>
        )}

        {/* The submit button lives in the dialog's footer, portalled outside
            this form in the DOM — `form="delete-assessment-form"` is what
            still ties it to this action despite that. */}
        <form id="delete-assessment-form" action={deleteAssessment} />
        <AlertDialog>
          <AlertDialogTrigger render={<Button size="sm" variant="destructive" />}>
            <Trash2 className="size-4" />
            Delete
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this assessment?</AlertDialogTitle>
              <AlertDialogDescription>
                It stays recoverable behind the scenes, but disappears from every list here.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                type="submit"
                form="delete-assessment-form"
                variant="destructive"
                disabled={deleting}
              >
                {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
