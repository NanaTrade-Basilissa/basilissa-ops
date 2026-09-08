import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A styled native <select>. Deliberately not a custom listbox/combobox
 * primitive native selects are fully keyboard- and screen-reader-
 * accessible out of the box, work great on mobile (the OS picker), and
 * need no extra dependency.
 */
function NativeSelect({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="native-select"
        className={cn(
          "border-input flex h-10 w-full appearance-none rounded-md border bg-transparent px-3 py-2 pr-9 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
      />
    </div>
  );
}

export { NativeSelect };
