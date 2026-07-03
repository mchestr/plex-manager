import { HTMLAttributes, forwardRef } from "react"
import { cn } from "@/lib/utils"

type CardPadding = "none" | "sm" | "md" | "lg"

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Inner padding. Defaults to "md" (p-6), the app's most common panel padding. */
  padding?: CardPadding
}

const paddingClasses: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
}

/**
 * Shared surface/panel primitive for the dark-slate theme.
 *
 * Replaces the hand-copied `bg-slate-800/50 backdrop-blur-sm border
 * border-slate-700 rounded-lg p-6` container that was duplicated across dozens
 * of files, so the canonical panel look is defined in one place. Extra classes
 * can still be layered via `className`.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ padding = "md", className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg",
          paddingClasses[padding],
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = "Card"
