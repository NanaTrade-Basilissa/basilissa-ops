"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
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
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  userId: string | null;
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setInternalOpen;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    if (!userId) return;
    startTransition(async () => {
      setDetail(await getUserDetailAction(userId));
    });
  }, [userId]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setDetail(null);
    }
  };

  useEffect(() => {
    if (open) {
      load();
    }
  }, [open, load]);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      {trigger ? <SheetTrigger render={trigger} /> : null}
      <SheetContent className="w-full data-[side=right]:w-full sm:max-w-full data-[side=right]:sm:max-w-full lg:w-1/3 data-[side=right]:lg:w-1/3 lg:max-w-none data-[side=right]:lg:max-w-none overflow-y-auto">
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
              customRole={detail.user.customRole}
              availableCustomRoles={detail.availableCustomRoles}
              onMutated={load}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
