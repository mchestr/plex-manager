import { HTMLAttributes, forwardRef } from "react"
import { cn } from "@/lib/utils"

type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger"

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-slate-600 text-slate-200",
  info: "bg-cyan-500/20 text-cyan-300",
  success: "bg-green-500/20 text-green-300",
  warning: "bg-amber-500/20 text-amber-300",
  danger: "bg-red-500/20 text-red-300",
}

/**
 * Small status/label pill for the dark-slate theme.
 *
 * Standardizes the `inline-flex items-center rounded-full text-xs font-medium`
 * pill markup and its padding scale that were hand-written (with drifting
 * padding: px-2/px-2.5, py-0.5/py-1) across the admin surfaces.
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ tone = "neutral", className, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
          toneClasses[tone],
          className
        )}
        {...props}
      >
        {children}
      </span>
    )
  }
)

Badge.displayName = "Badge"
