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
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  tooltip?: string;
  subtext?: React.ReactNode;
  icon: LucideIcon;
  tone?: "default" | "good" | "critical";
}) {
  const valueEl = (
    <p className="font-heading mt-1 line-clamp-2 text-xl leading-tight font-bold text-foreground">
      {value}
    </p>
  );

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 px-5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
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
          {subtext && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtext}</p>}
        </div>
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            tone === "good" && "bg-status-good/10 text-status-good",
            tone === "critical" && "bg-status-critical/10 text-status-critical",
            tone === "default" && "bg-primary/10 text-foreground",
          )}
        >
          <Icon className="size-[18px]" />
        </span>
      </CardContent>
    </Card>
  );
}
