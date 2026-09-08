import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border text-foreground",
        destructive: "border-transparent bg-destructive/10 text-destructive",
        // Rating-tier variants, used consistently for score badges across
        // the customer flow and admin dashboard. Always paired with a text
        // label (e.g. "Good") — color is never the only signal.
        ratingExcellent: "border-transparent bg-status-good text-white",
        ratingGood: "border-transparent bg-status-good/80 text-white",
        ratingAverage: "border-transparent bg-status-warning text-foreground",
        ratingPoor: "border-transparent bg-status-serious text-white",
        ratingVeryPoor: "border-transparent bg-status-critical text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

/** Maps a 1-5 answer score to the matching badge variant. */
export function ratingBadgeVariant(score: number): VariantProps<typeof badgeVariants>["variant"] {
  switch (score) {
    case 5:
      return "ratingExcellent";
    case 4:
      return "ratingGood";
    case 3:
      return "ratingAverage";
    case 2:
      return "ratingPoor";
    default:
      return "ratingVeryPoor";
  }
}

export { Badge, badgeVariants };
