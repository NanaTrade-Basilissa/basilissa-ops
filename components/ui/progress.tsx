import { cn } from "@/lib/utils";

/**
 * Plain, dependency-free progress bar (no primitive library needed for a
 * determinate bar). Used for the "Question X of 5" indicator and for
 * rating-distribution bars in the dashboard.
 */
function Progress({
  value,
  max = 100,
  className,
  indicatorClassName,
  ...props
}: React.ComponentProps<"div"> & { value: number; max?: number; indicatorClassName?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn("bg-muted relative h-2 w-full overflow-hidden rounded-full", className)}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className={cn("bg-primary h-full rounded-full transition-all duration-300 ease-out", indicatorClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export { Progress };
