import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        // Rating-tier variants, used consistently for score badges across
        // the customer flow and admin dashboard. Always paired with a text
        // label (e.g. "Good") — color is never the only signal. Kept as a
        // project-specific extension of the upstream shadcn variants above,
        // not part of the canonical component itself.
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
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

/** Maps a 1-5 answer score to the matching badge variant. */
export function ratingBadgeVariant(score: number): VariantProps<typeof badgeVariants>["variant"] {
  switch (score) {
    case 5:
      return "ratingExcellent"
    case 4:
      return "ratingGood"
    case 3:
      return "ratingAverage"
    case 2:
      return "ratingPoor"
    default:
      return "ratingVeryPoor"
  }
}

export { Badge, badgeVariants }
