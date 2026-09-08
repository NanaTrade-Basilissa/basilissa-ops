"use client";

import { useActionState } from "react";
import { Loader2, Lock, Send, Trash2 } from "lucide-react";
import type { AptitudeTestStatus } from "@prisma/client";
import type { AptitudeFormState } from "@/lib/modules/aptitude/actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function AptitudeTestLifecycle({
  status,
  publishAction,
  closeAction,
  deleteAction,
}: {
  status: AptitudeTestStatus;
  publishAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  closeAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
  deleteAction: (prev: AptitudeFormState, formData: FormData) => Promise<AptitudeFormState>;
}) {
  const [publishState, publish, publishing] = useActionState<AptitudeFormState, FormData>(publishAction, undefined);
  const [closeState, close, closing] = useActionState<AptitudeFormState, FormData>(closeAction, undefined);
  const [deleteState, deleteTest, deleting] = useActionState<AptitudeFormState, FormData>(deleteAction, undefined);

  return (
    <div className="space-y-2">
      {(publishState?.error || closeState?.error || deleteState?.error) && (
        <Alert variant="destructive" className="max-w-sm">
          <AlertDescription>{publishState?.error ?? closeState?.error ?? deleteState?.error}</AlertDescription>
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

        <form
          action={deleteTest}
          onSubmit={(event) => {
            if (
              !window.confirm(
                "Delete this aptitude test? It stays recoverable behind the scenes, but disappears from every list here.",
              )
            ) {
              event.preventDefault();
            }
          }}
        >
          <Button type="submit" size="sm" variant="destructive" disabled={deleting}>
            {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Delete
          </Button>
        </form>
      </div>
    </div>
  );
}
