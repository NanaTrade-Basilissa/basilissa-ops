"use client";

import * as React from "react";
import Link from "next/link";
import { MoreVertical } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type TopActionItem = {
  id?: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  href?: string;
  variant?: "default" | "destructive";
  buttonVariant?: "default" | "outline" | "ghost" | "secondary" | "destructive";
  disabled?: boolean;
  dialog?: (props: { open: boolean; onOpenChange: (open: boolean) => void }) => React.ReactNode;
};

export function TopActionsBar({
  primaryAction,
  secondaryActions = [],
  className,
}: {
  primaryAction?: {
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    onClick?: () => void;
    href?: string;
    dialog?: (props: { open: boolean; onOpenChange: (open: boolean) => void }) => React.ReactNode;
    render?: React.ReactNode;
  };
  secondaryActions?: (TopActionItem | null | undefined | false)[];
  className?: string;
}) {
  const [activeDialogIndex, setActiveDialogIndex] = React.useState<number | null>(null);
  const [primaryDialogOpen, setPrimaryDialogOpen] = React.useState(false);

  const actions = React.useMemo(
    () => secondaryActions.filter((a): a is TopActionItem => Boolean(a)),
    [secondaryActions]
  );

  const hasSecondary = actions.length > 0;
  // If > 1 secondary action, collapse them all into 3 dots menu
  const collapseAllSecondary = actions.length > 1;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Primary Action Button */}
      {primaryAction && (
        <>
          {primaryAction.render ? (
            primaryAction.render
          ) : primaryAction.href ? (
            <Link
              href={primaryAction.href}
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "h-9 gap-1.5")}
              title={primaryAction.label}
            >
              {primaryAction.icon && <primaryAction.icon className="size-4 shrink-0" />}
              <span className="hidden sm:inline">{primaryAction.label}</span>
            </Link>
          ) : primaryAction.dialog ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setPrimaryDialogOpen(true)}
              className="h-9 gap-1.5"
              title={primaryAction.label}
            >
              {primaryAction.icon && <primaryAction.icon className="size-4 shrink-0" />}
              <span className="hidden sm:inline">{primaryAction.label}</span>
            </Button>
          ) : (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={primaryAction.onClick}
              className="h-9 gap-1.5"
              title={primaryAction.label}
            >
              {primaryAction.icon && <primaryAction.icon className="size-4 shrink-0" />}
              <span className="hidden sm:inline">{primaryAction.label}</span>
            </Button>
          )}

          {primaryAction.dialog &&
            primaryAction.dialog({
              open: primaryDialogOpen,
              onOpenChange: setPrimaryDialogOpen,
            })}
        </>
      )}

      {/* Single Secondary Action on Desktop */}
      {!collapseAllSecondary && hasSecondary && (
        <div className="hidden sm:flex items-center gap-2">
          {actions.map((act, idx) => {
            const Icon = act.icon;
            const btnVariant = act.buttonVariant ?? "outline";
            if (act.href) {
              return (
                <Link
                  key={act.id ?? idx}
                  href={act.href}
                  className={cn(buttonVariants({ variant: btnVariant, size: "sm" }), "h-9 gap-1.5 text-xs")}
                >
                  {Icon && <Icon className="size-3.5" />}
                  <span>{act.label}</span>
                </Link>
              );
            }
            return (
              <Button
                key={act.id ?? idx}
                type="button"
                variant={btnVariant}
                size="sm"
                disabled={act.disabled}
                onClick={() => {
                  if (act.dialog) setActiveDialogIndex(idx);
                  else act.onClick?.();
                }}
                className="h-9 gap-1.5 text-xs"
              >
                {Icon && <Icon className="size-3.5" />}
                <span>{act.label}</span>
              </Button>
            );
          })}
        </div>
      )}

      {/* 3-Dots Dropdown Menu (on mobile, or when >1 secondary action) */}
      {hasSecondary && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn(
                  "size-9",
                  !collapseAllSecondary && "sm:hidden"
                )}
              />
            }
          >
            <MoreVertical className="size-4" />
            <span className="sr-only">More actions</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            {actions.map((act, idx) => {
              const Icon = act.icon;
              if (act.href) {
                return (
                  <DropdownMenuItem
                    key={act.id ?? idx}
                    variant={act.variant}
                    disabled={act.disabled}
                    render={<Link href={act.href} className="flex w-full items-center gap-2" />}
                  >
                    {Icon && <Icon className="size-4 shrink-0" />}
                    <span>{act.label}</span>
                  </DropdownMenuItem>
                );
              }
              return (
                <DropdownMenuItem
                  key={act.id ?? idx}
                  variant={act.variant}
                  disabled={act.disabled}
                  onClick={() => {
                    if (act.dialog) {
                      setActiveDialogIndex(idx);
                    } else {
                      act.onClick?.();
                    }
                  }}
                  className="gap-2"
                >
                  {Icon && <Icon className="size-4 shrink-0" />}
                  <span>{act.label}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Controlled dialog rendering for secondary actions */}
      {actions.map((act, idx) => {
        if (!act.dialog) return null;
        return (
          <React.Fragment key={act.id ?? idx}>
            {act.dialog({
              open: activeDialogIndex === idx,
              onOpenChange: (open) => setActiveDialogIndex(open ? idx : null),
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}
