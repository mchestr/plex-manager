import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

/**
 * An in-page surface (ui-design-system 5.4): `bg-card`, a 1px border and
 * radius 8, no shadow. Interactive cards change only the border on hover.
 */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card" className={cn("flex flex-col rounded-lg border bg-card text-card-foreground", className)} {...props} />
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min items-start gap-1 px-5 pt-5 has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className
      )}
      {...props}
    />
  )
}

/** An `h3` by default; `as="h2"` where the card sits straight under the page's `h1`, so no heading level is skipped. */
export function CardTitle({ as: Heading = "h3", className, children, ...props }: ComponentProps<"h3"> & { as?: "h2" | "h3" }) {
  return (
    <Heading data-slot="card-title" className={cn("text-h3 text-foreground", className)} {...props}>
      {children}
    </Heading>
  )
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p data-slot="card-description" className={cn("text-ui text-muted-foreground", className)} {...props} />
}

/** A control at the header's trailing edge, beside the title and description. */
export function CardAction({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  )
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-5 py-4", className)} {...props} />
}

/** Result text on the left, actions after it. */
export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div data-slot="card-footer" className={cn("flex items-center gap-3 border-t px-5 py-3", className)} {...props} />
  )
}
