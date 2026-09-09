"use client";

import { useActionState, useEffect } from "react";
import { Loader2, Mail, UserCheck, UserX } from "lucide-react";
import type { UserStatus } from "@prisma/client";
import type { RoleActionState } from "@/lib/modules/identity/actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function AccountStatusControls({
  userId,
  email,
  name,
  status,
  isSelf,
  statusAction,
  resendAction,
  emailConfigured,
  onMutated,
}: {
  userId: string;
  email: string;
  name: string;
  status: UserStatus;
  isSelf: boolean;
  statusAction: (prev: RoleActionState, formData: FormData) => Promise<RoleActionState>;
  resendAction: (prev: RoleActionState, formData: FormData) => Promise<RoleActionState>;
  emailConfigured: boolean;
  onMutated?: () => void;
}) {
  const [statusState, changeStatus, changing] = useActionState<RoleActionState, FormData>(
    statusAction,
    undefined,
  );
  const [resendState, resend, resending] = useActionState<RoleActionState, FormData>(
    resendAction,
    undefined,
  );

  useEffect(() => {
    if (statusState?.done) onMutated?.();
  }, [statusState, onMutated]);

  const suspended = status !== "ACTIVE";

  return (
    <div className="w-full space-y-3">
      {(statusState?.error || resendState?.error) && (
        <Alert variant="destructive">
          <AlertDescription>{statusState?.error ?? resendState?.error}</AlertDescription>
        </Alert>
      )}
      {resendState?.done && (
        <Alert>
          <AlertDescription>
            If that address has an account, a link is on its way. It expires in an hour.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {emailConfigured && (
          <form action={resend}>
            <input type="hidden" name="email" value={email} />
            <Button type="submit" variant="outline" size="sm" disabled={resending}>
              {resending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
              Send a sign-in link
            </Button>
          </form>
        )}

        {/*
          Hidden for your own account rather than shown and refused. The service
          refuses it too — this is the courtesy, that is the boundary.
        */}
        {!isSelf && (
          <form action={changeStatus}>
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="status" value={suspended ? "ACTIVE" : "SUSPENDED"} />
            <Button
              type="submit"
              variant={suspended ? "outline" : "destructive"}
              size="sm"
              disabled={changing}
            >
              {changing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : suspended ? (
                <UserCheck className="size-4" />
              ) : (
                <UserX className="size-4" />
              )}
              {suspended ? `Reactivate ${name.split(" ")[0]}` : "Suspend account"}
            </Button>
          </form>
        )}
      </div>

      {!suspended && !isSelf && (
        <p className="text-xs text-muted-foreground">
          Suspending signs them out of every device immediately and blocks sign-in. Their
          record, attendance and audit history stay intact.
        </p>
      )}
    </div>
  );
}
