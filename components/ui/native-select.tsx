import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A styled native <select>. Deliberately not a custom listbox/combobox
 * primitive native selects are fully keyboard- and screen-reader-
 * accessible out of the box, work great on mobile (the OS picker), and
 * need no extra dependency.
 */
export type NativeSelectProps = React.ComponentProps<"select"> & {
  containerClassName?: string;
};

function NativeSelect({
  className,
  containerClassName,
  children,
  ...props
}: NativeSelectProps) {
  // If caller specified custom width (e.g. w-auto, w-fit, w-*, min-w-*), size wrapper to match
  const isExplicitWidth =
    className && (/\bw-(?!full\b)/.test(className) || /\bmin-w-/.test(className));

  return (
    <div
      className={cn(
        "relative min-w-0",
        isExplicitWidth ? "w-fit inline-block shrink-0" : "w-full",
        containerClassName,
      )}
    >
      <select
        data-slot="native-select"
        className={cn(
          "border-input flex h-9 w-full min-w-0 appearance-none rounded-md border bg-transparent px-3 py-1.5 pr-8 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2"
      />
    </div>
  );
}

export { NativeSelect };
