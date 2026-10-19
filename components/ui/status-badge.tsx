import type { LucideIcon } from "lucide-react"
import type { ComponentProps } from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Tone } from "@/lib/ui/status"

interface StatusProps extends Omit<ComponentProps<"span">, "children"> {
  tone: Tone
  /** The word for the state. Colour never carries a state alone (ui-design-system 3.1). */
  label: string
}

interface StatusBadgeProps extends StatusProps {
  icon?: LucideIcon
  /** A muted line under the badge, such as "Renews Oct 2". */
  sub?: string
}

/**
 * A state as a badge: the tone's colour, an optional icon and always its word.
 * `plain` renders the word as text. Presentational until P3.9 adds the
 * `domain` and `value` props and the `STATUS` table.
 */
export function StatusBadge({ tone, label, icon, sub, className, ...props }: StatusBadgeProps) {
  const badge =
    tone === "plain" ? (
      <span data-slot="status-badge" className="text-ui text-foreground">
        {label}
      </span>
    ) : (
      <Badge data-slot="status-badge" variant={tone} icon={icon} dot={!icon && tone !== "neutral" && tone !== "outline"}>
        {label}
      </Badge>
    )
  if (!sub) {
    return (
      <span className={cn("inline-flex", className)} {...props}>
        {badge}
      </span>
    )
  }
  return (
    <span className={cn("inline-flex flex-col items-start gap-0.5", className)} {...props}>
      {badge}
      <span className="text-caption text-muted-foreground">{sub}</span>
    </span>
  )
}

const dotColour: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  destructive: "bg-destructive",
  neutral: "bg-muted-foreground",
  outline: "bg-muted-foreground",
  plain: "bg-muted-foreground",
}

/** A live state as a dot and a word, such as "Online" in a health line. */
export function StatusDot({ tone, label, className, ...props }: StatusProps) {
  return (
    <span data-slot="status-dot" className={cn("inline-flex items-center gap-2 text-ui text-foreground", className)} {...props}>
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", dotColour[tone])} />
      {label}
    </span>
  )
}
