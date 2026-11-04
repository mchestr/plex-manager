import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

/**
 * The pass pieces (ui-design-system 6.6) that the member pass on `/` and the
 * invite pass share: the card, its dashed-edge stub and the monogram tile.
 * No hooks and no client directive, so Server and Client Components both use them.
 */

export function Pass({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("w-full overflow-hidden rounded-xl border bg-card text-card-foreground", className)} {...props} />
}

interface PassStubProps extends ComponentProps<"div"> {
  /** A voided pass: the stub loses its muted fill. */
  voided?: boolean
}

export function PassStub({ voided, className, ...props }: PassStubProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 border-t border-dashed border-border-strong px-6 py-5 sm:px-7",
        voided ? "bg-card" : "bg-muted",
        className,
      )}
      {...props}
    />
  )
}

const monogramSizes = {
  lg: { tile: "size-12 rounded-[10px] text-h2", pip: "top-1.5 right-1.5 size-2 rounded-[2px]" },
  sm: { tile: "size-8 rounded-md text-ui font-semibold", pip: "top-1 right-1 size-1.5 rounded-[1.5px]" },
}

/**
 * The server's letter on the secondary tile with the primary pip; `null` draws
 * the pip alone. With `src`, the uploaded icon (Settings, Appearance) instead.
 */
export function Monogram({ letter, size = "lg", src }: { letter: string | null; size?: keyof typeof monogramSizes; src?: string }) {
  const { tile, pip } = monogramSizes[size]
  if (src) {
    return (
      // A plain <img>: images are unoptimized (next.config.js)
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" aria-hidden="true" data-testid="brand-icon" className={cn("shrink-0 object-cover", tile)} />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={cn("relative flex shrink-0 items-center justify-center border border-border-strong bg-secondary text-foreground", tile)}
    >
      {letter}
      <span className={cn("absolute bg-primary", pip)} />
    </span>
  )
}
