import Image from "next/image";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/platform/constants";

/**
 * Basilissa's official brand mark: the halftone "B" monogram cropped from
 * public/bsa-logo.jpeg (public/bsa-logo-icon.png), square-cropped to isolate
 * the monogram from the baked-in wordmark below it. Every screen in the app
 * renders this one component, so a future logo swap only touches this file.
 */
export function Logo({
  className,
  showWordmark = true,
  size = "md",
}: {
  className?: string;
  showWordmark?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: { box: "size-7", px: 28, text: "text-sm" },
    md: { box: "size-9", px: 36, text: "text-lg" },
    lg: { box: "size-14", px: 56, text: "text-2xl" },
  }[size];

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-sm",
          sizes.box,
        )}
      >
        <Image
          src="/bsa-logo-icon.png"
          alt=""
          aria-hidden
          width={sizes.px}
          height={sizes.px}
          className="size-full object-cover"
          priority
        />
      </span>
      {showWordmark && (
        <span className={cn("font-heading font-semibold tracking-tight text-foreground", sizes.text)}>
          {APP_NAME}
        </span>
      )}
    </div>
  );
}
