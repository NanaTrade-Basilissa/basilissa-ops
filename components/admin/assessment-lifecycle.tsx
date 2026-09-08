"use client";

import { useActionState } from "react";
import { Loader2, Lock, Send } from "lucide-react";
import type { AssessmentStatus } from "@prisma/client";
import type { AssessmentFormState } from "@/lib/modules/assessments/actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function AssessmentLifecycle({
  status,
  publishAction,
  closeAction,
}: {
  status: AssessmentStatus;
  publishAction: (prev: AssessmentFormState, formData: FormData) => Promise<AssessmentFormState>;
  closeAction: (prev: AssessmentFormState, formData: FormData) => Promise<AssessmentFormState>;
}) {
  const [publishState, publish, publishing] = useActionState<AssessmentFormState, FormData>(
    publishAction,
    undefined,
  );
  const [closeState, close, closing] = useActionState<AssessmentFormState, FormData>(
    closeAction,
    undefined,
  );

  return (
    <div className="space-y-2">
      {(publishState?.error || closeState?.error) && (
        <Alert variant="destructive" className="max-w-sm">
          <AlertDescription>{publishState?.error ?? closeState?.error}</AlertDescription>
        </Alert>
      )}

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
    </div>
  );
}
