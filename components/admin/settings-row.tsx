import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * One row of a settings list: a label (and optional description) on the
 * left, a control on the right — a Switch, a value, a badge group. Wrap a
 * run of these in `divide-y divide-border` for the hairline separators.
 */
export function SettingsRow({
  htmlFor,
  label,
  description,
  control,
  className,
}: {
  htmlFor?: string;
  label: ReactNode;
  description?: ReactNode;
  control: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0",
        className,
      )}
    >
      <div className="space-y-0.5 pr-4">
        {htmlFor ? (
          <Label htmlFor={htmlFor} className="text-sm font-medium">
            {label}
          </Label>
        ) : (
          <p className="text-sm font-medium text-foreground">{label}</p>
        )}
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {control}
    </div>
  );
}
