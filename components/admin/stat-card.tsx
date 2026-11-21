import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  /** Full text to show on hover when `value` may be truncated (e.g. a long branch name). */
  tooltip,
  subtext,
  badge,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  tooltip?: string;
  subtext?: React.ReactNode;
  badge?: React.ReactNode;
  icon: LucideIcon;
  tone?: "default" | "good" | "critical" | "info" | "brand";
  className?: string;
}) {
  const valueEl = (
    <p className="font-heading text-2xl leading-none font-bold tabular-nums text-foreground tracking-tight">
      {value}
    </p>
  );

  return (
    <Card className={cn("h-full", className)}>
      <CardContent className="flex flex-col justify-between p-5 h-full gap-3">
        {/* Top line: Label on left, subtle icon on right */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-lg",
              tone === "good" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
              tone === "critical" && "bg-destructive/10 text-destructive",
              tone === "info" && "bg-blue-500/10 text-blue-700 dark:text-blue-400",
              tone === "brand" && "bg-primary/20 text-foreground dark:text-primary",
              tone === "default" && "bg-muted/70 text-muted-foreground"
            )}
          >
            <Icon className="size-4" />
          </span>
        </div>

        {/* Hero value + optional pill badge */}
        <div className="flex items-baseline gap-2.5 flex-wrap">
          {tooltip ? (
            <Tooltip>
              <TooltipTrigger className="cursor-default text-left" render={<div />}>
                {valueEl}
              </TooltipTrigger>
              <TooltipContent>{tooltip}</TooltipContent>
            </Tooltip>
          ) : (
            valueEl
          )}
          {badge}
        </div>

        {/* Subtext */}
        {subtext && (
          <p className="text-[11px] font-normal text-muted-foreground truncate">{subtext}</p>
        )}
      </CardContent>
    </Card>
  );
}
