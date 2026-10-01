import { cn } from "@/lib/utils";

export type CycleShift = { id: string; name: string; startMinute: number; endMinute: number };

/** A short label for a shift, from its first word: "Morning (07:00-15:00)" → "Morning". */
export function shiftShortName(name: string): string {
  return name.split(/[\s(]/)[0] || name;
}

/**
 * Colour by time of day rather than by name, so a renamed or new template
 * still reads at a glance: early starts warm, late starts dark.
 */
function toneFor(shift: Pick<CycleShift, "startMinute" | "endMinute"> | undefined): string {
  if (!shift) return "border-dashed border-border bg-muted/40 text-muted-foreground";
  const length = (shift.endMinute - shift.startMinute + 1440) % 1440;
  if (length >= 12 * 60) return "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200";
  if (shift.startMinute >= 14 * 60) return "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200";
  if (shift.startMinute < 8 * 60) return "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200";
  return "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200";
}

/** A pattern's cycle as a row of day chips: M M M E E E Off Off. */
export function PatternCycle({
  cycle,
  shifts,
  highlight = [],
  size = "sm",
}: {
  cycle: readonly (string | null)[];
  shifts: readonly CycleShift[];
  /** Day indexes to ring, e.g. short rest. */
  highlight?: readonly number[];
  size?: "sm" | "xs";
}) {
  const byId = new Map(shifts.map((shift) => [shift.id, shift]));
  return (
    <div className="flex flex-wrap gap-1">
      {cycle.map((shiftId, index) => {
        const shift = shiftId ? byId.get(shiftId) : undefined;
        const name = shift ? shiftShortName(shift.name) : "Off";
        return (
          <span
            key={index}
            title={`Day ${index + 1}: ${shift ? shift.name : "Day off"}`}
            className={cn(
              "inline-flex items-center justify-center rounded border font-semibold",
              size === "sm" ? "h-6 min-w-6 px-1.5 text-[11px]" : "h-5 min-w-5 px-1 text-[10px]",
              toneFor(shift),
              highlight.includes(index) && "ring-2 ring-rose-400 ring-offset-1 ring-offset-background",
            )}
          >
            {shift ? name.charAt(0).toUpperCase() : "Off"}
          </span>
        );
      })}
    </div>
  );
}
