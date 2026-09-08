import { cn } from "@/lib/utils";

/** A checkbox styled as a toggle switch. No primitive library required. */
function Switch({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <label
      className={cn(
        "bg-input has-[:checked]:bg-primary relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
        className,
      )}
    >
      <input type="checkbox" data-slot="switch" className="peer sr-only" {...props} />
      <span
        aria-hidden
        className="pointer-events-none absolute left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4"
      />
    </label>
  );
}

export { Switch };
