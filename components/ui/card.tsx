import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

type CardPadding = "none" | "sm" | "md" | "lg"

const paddingClasses: Record<CardPadding, string> = {
  none: "p-0",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
}

interface CardProps extends ComponentProps<"div"> {
  /**
   * @deprecated Compose `CardHeader`, `CardContent` and `CardFooter` instead.
   * Wraps the children in a `CardContent` with this padding, and `className`
   * styles that padded box, as it did before. Removed in P10.11.
   */
  padding?: CardPadding
}

/**
 * An in-page surface (ui-design-system 5.4): `bg-card`, a 1px border and
 * radius 8, no shadow. Interactive cards change only the border on hover.
 */
export function Card({ padding, className, children, ...props }: CardProps) {
  const root = "flex flex-col rounded-lg border bg-card text-card-foreground"
  if (padding) {
    return (
      <div data-slot="card" className={root} {...props}>
        <CardContent className={cn(paddingClasses[padding], className)}>{children}</CardContent>
      </div>
    )
  }
  return (
    <div data-slot="card" className={cn(root, className)} {...props}>
      {children}
    </div>
  )
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

export function CardTitle({ className, children, ...props }: ComponentProps<"h3">) {
  return (
    <h3 data-slot="card-title" className={cn("text-h3 text-foreground", className)} {...props}>
      {children}
    </h3>
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
