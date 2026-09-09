"use client";

import { useCallback, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { getUserDetailAction } from "@/lib/modules/identity/actions";
import { UserDetailContent } from "@/components/admin/user-detail-content";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type Detail = NonNullable<Awaited<ReturnType<typeof getUserDetailAction>>>;

export function UserDetailSheet({
  userId,
  trigger,
}: {
  userId: string;
  trigger: React.ReactElement;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      setDetail(await getUserDetailAction(userId));
    });
  }, [userId]);

  return (
    <Sheet
      onOpenChange={(open) => {
        if (open) load();
      }}
    >
      <SheetTrigger render={trigger} />
      <SheetContent className="w-full overflow-y-auto sm:w-1/2 sm:max-w-none">
        <SheetHeader>
          <SheetTitle>User</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          {isPending && !detail && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}
          {detail && (
            <UserDetailContent
              user={detail.user}
              canWrite={detail.canWrite}
              canAssign={detail.canAssign}
              roles={detail.roles}
              branches={detail.branches}
              active={detail.active}
              revoked={detail.revoked}
              isSelf={detail.isSelf}
              emailConfigured={detail.emailConfigured}
              onMutated={load}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
