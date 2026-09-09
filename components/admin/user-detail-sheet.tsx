"use client";

import { useCallback, useState, useTransition } from "react";
import { getUserDetailAction } from "@/lib/modules/identity/actions";
import { UserDetailContent } from "@/components/admin/user-detail-content";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type Detail = NonNullable<Awaited<ReturnType<typeof getUserDetailAction>>>;

function UserDetailSkeleton() {
  return (
    <div className="space-y-6 pt-2">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="space-y-4 rounded-xl border border-border p-4">
        <Skeleton className="h-5 w-24" />
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
      <div className="space-y-3 rounded-xl border border-border p-4">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}

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
        if (open) {
          load();
        } else {
          setDetail(null);
        }
      }}
    >
      <SheetTrigger render={trigger} />
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl lg:max-w-2xl">
        <SheetHeader>
          <SheetTitle>User</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          {(isPending || !detail) && <UserDetailSkeleton />}
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
