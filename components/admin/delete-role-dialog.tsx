"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteRoleAction, type RoleFormState } from "@/lib/modules/identity/actions";
import { Button } from "@/components/ui/button";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function DeleteRoleDialog({
  role,
  trigger,
  onDeleted,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  role: { id: string; name: string; userCount: number };
  trigger?: React.ReactElement;
  onDeleted?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setInternalOpen;
  const [state, formAction, isPending] = useActionState<RoleFormState, FormData>(
    deleteRoleAction,
    undefined,
  );

  useEffect(() => {
    if (state?.success) {
      toast.success(`Role "${role.name}" deleted successfully.`);
      setOpen(false);
      onDeleted?.();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, role.name, onDeleted, setOpen]);

  const hasAssignedUsers = role.userCount > 0;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <AlertDialogTrigger render={trigger} />
      ) : controlledOpen === undefined ? (
        <AlertDialogTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          }
        />
      ) : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Role: {role.name}</AlertDialogTitle>
          <AlertDialogDescription>
            {hasAssignedUsers ? (
              <span className="text-destructive font-medium">
                This role cannot be deleted while users are assigned to it.
              </span>
            ) : (
              `Are you sure you want to delete the "${role.name}" role? This action cannot be undone.`
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {hasAssignedUsers ? (
          <Alert variant="destructive" className="my-2">
            <AlertTitle>Role in use</AlertTitle>
            <AlertDescription>
              Currently, <strong>{role.userCount}</strong> user{role.userCount === 1 ? "" : "s"}
              {role.userCount === 1 ? " is" : " are"} assigned to this role. You must reassign or
              unassign all users before this role can be safely deleted.
            </AlertDescription>
          </Alert>
        ) : (
          state?.error && (
            <Alert variant="destructive" className="my-2">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {hasAssignedUsers ? "Close" : "Cancel"}
          </AlertDialogCancel>
          {!hasAssignedUsers && (
            <form action={formAction}>
              <input type="hidden" name="roleId" value={role.id} />
              <AlertDialogAction
                type="submit"
                disabled={isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isPending && <Loader2 className="size-4 animate-spin mr-1.5" />}
                Delete Role
              </AlertDialogAction>
            </form>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
