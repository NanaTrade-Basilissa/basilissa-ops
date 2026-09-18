"use client";

import * as React from "react";
import Link from "next/link";
import { MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TableRowActionItem = {
  id?: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  onSelect?: () => void;
  href?: string;
  variant?: "default" | "destructive";
  buttonVariant?: "default" | "outline" | "ghost" | "secondary" | "destructive";
  disabled?: boolean;
  dialog?: (props: { open: boolean; onOpenChange: (open: boolean) => void }) => React.ReactNode;
};

export interface TableRowActionsProps {
  actions: (TableRowActionItem | null | undefined | false)[];
  align?: "start" | "end" | "center";
  className?: string;
}

export function TableRowActions({
  actions: rawActions,
  align = "end",
  className,
}: TableRowActionsProps) {
  const [activeDialogIndex, setActiveDialogIndex] = React.useState<number | null>(null);

  // Filter out any falsy action items
  const actions = React.useMemo(
    () => rawActions.filter((a): a is TableRowActionItem => Boolean(a)),
    [rawActions]
  );

  if (actions.length === 0) {
    return null;
  }

  const renderDesktopSingleAction = (action: TableRowActionItem) => {
    const Icon = action.icon;
    const variant =
      action.buttonVariant ?? (action.variant === "destructive" ? "destructive" : "outline");

    if (action.href) {
      return (
        <Link
          href={action.href}
          className={cn(
            buttonVariants({ variant, size: "sm" }),
            "h-8 gap-1.5 text-xs whitespace-nowrap",
            action.disabled && "pointer-events-none opacity-50"
          )}
        >
          {Icon && <Icon className="size-3.5 shrink-0" />}
          <span>{action.label}</span>
        </Link>
      );
    }

    if (action.dialog) {
      return (
        <Button
          type="button"
          variant={variant}
          size="sm"
          disabled={action.disabled}
          onClick={() => setActiveDialogIndex(0)}
          className="h-8 gap-1.5 text-xs whitespace-nowrap"
        >
          {Icon && <Icon className="size-3.5 shrink-0" />}
          <span>{action.label}</span>
        </Button>
      );
    }

    return (
      <Button
        type="button"
        variant={variant}
        size="sm"
        disabled={action.disabled}
        onClick={action.onClick ?? action.onSelect}
        className="h-8 gap-1.5 text-xs whitespace-nowrap"
      >
        {Icon && <Icon className="size-3.5 shrink-0" />}
        <span>{action.label}</span>
      </Button>
    );
  };

  const renderDropdownMenu = (isMobileOnly = false) => {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "size-8 text-muted-foreground hover:text-foreground",
                isMobileOnly ? "inline-flex sm:hidden" : "inline-flex"
              )}
            />
          }
        >
          <MoreVertical className="size-4" />
          <span className="sr-only">Actions</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="min-w-36">
          {actions.map((action, idx) => {
            const Icon = action.icon;

            if (action.href) {
              return (
                <DropdownMenuItem
                  key={action.id ?? idx}
                  variant={action.variant}
                  disabled={action.disabled}
                  render={<Link href={action.href} className="flex w-full items-center gap-2" />}
                >
                  {Icon && <Icon className="size-3.5 shrink-0" />}
                  <span>{action.label}</span>
                </DropdownMenuItem>
              );
            }

            return (
              <DropdownMenuItem
                key={action.id ?? idx}
                variant={action.variant}
                disabled={action.disabled}
                onClick={() => {
                  if (action.dialog) {
                    setActiveDialogIndex(idx);
                  } else if (action.onClick || action.onSelect) {
                    (action.onClick ?? action.onSelect)!();
                  }
                }}
                className="gap-2"
              >
                {Icon && <Icon className="size-3.5 shrink-0" />}
                <span>{action.label}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div className={cn("flex items-center justify-end", className)}>
      {actions.length === 1 ? (
        <>
          <div className="hidden sm:inline-flex">{renderDesktopSingleAction(actions[0])}</div>
          {renderDropdownMenu(true)}
        </>
      ) : (
        renderDropdownMenu(false)
      )}

      {/* Controlled Dialog Rendering */}
      {actions.map((action, idx) => {
        if (!action.dialog) return null;
        return (
          <React.Fragment key={action.id ?? idx}>
            {action.dialog({
              open: activeDialogIndex === idx,
              onOpenChange: (open) => {
                if (!open && activeDialogIndex === idx) {
                  setActiveDialogIndex(null);
                }
              },
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}
