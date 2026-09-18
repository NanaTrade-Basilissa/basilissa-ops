"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import { assignUserCustomRoleAction, type RoleFormState } from "@/lib/modules/identity/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function UserCustomRoleCard({
  userId,
  customRole,
  availableCustomRoles,
  canAssign,
  onMutated,
}: {
  userId: string;
  customRole?: { id: string; name: string; description?: string | null } | null;
  availableCustomRoles: { id: string; name: string; description?: string | null }[];
  canAssign: boolean;
  onMutated?: () => void;
}) {
  const [selectedRoleId, setSelectedRoleId] = useState<string>(customRole?.id ?? "");

  const [state, formAction, isPending] = useActionState<RoleFormState, FormData>(
    assignUserCustomRoleAction,
    undefined,
  );

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSelectedRoleId(customRole?.id ?? "");
  }, [customRole]);

  useEffect(() => {
    if (state?.success) {
      toast.success("User custom role updated.");
      onMutated?.();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, onMutated]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="size-4 text-primary" />
          Custom Role &amp; Permissions
        </CardTitle>
        <CardDescription className="text-xs">
          Assign an administrator-defined custom role.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state?.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border bg-muted/20">
          <div>
            <span className="text-xs text-muted-foreground block">Currently Assigned:</span>
            {customRole ? (
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="secondary" className="font-semibold text-xs">
                  {customRole.name}
                </Badge>
                {customRole.description && (
                  <span className="text-xs text-muted-foreground">{customRole.description}</span>
                )}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground italic mt-0.5 block">
                None (No custom role assigned)
              </span>
            )}
          </div>
        </div>

        {canAssign && (
          <form action={formAction} className="space-y-3 pt-1">
            <input type="hidden" name="userId" value={userId} />

            <div className="space-y-1.5">
              <Label htmlFor="customRoleId" className="text-xs">
                Select Custom Role
              </Label>
              <NativeSelect
                id="customRoleId"
                name="customRoleId"
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                disabled={isPending}
              >
                <option value="">None (Remove custom role)</option>
                {availableCustomRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <Button
              type="submit"
              size="sm"
              disabled={isPending || selectedRoleId === (customRole?.id ?? "")}
              className="gap-1.5"
            >
              {isPending && <Loader2 className="size-3.5 animate-spin" />}
              Save Custom Role
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
