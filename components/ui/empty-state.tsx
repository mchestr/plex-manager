import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"

type EmptyStateKind = "first-use" | "filtered" | "unavailable"

interface EmptyStateProps {
  /**
   * `first-use`: nothing exists yet ("Create invite"); `filtered`: the filters
   * hide every row ("Clear filters"); `unavailable`: the source did not answer ("Retry").
   */
  kind: EmptyStateKind
  icon: LucideIcon
  title: string
  description: string
  primaryAction?: ReactNode
  secondaryAction?: ReactNode
  className?: string
  "data-testid"?: string
}

/**
 * What a list shows when it has no rows (ui-design-system 5.5). An
 * unavailable source is announced as a status, since it replaces content the
 * reader expected.
 */
export function EmptyState({
  kind,
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      data-kind={kind}
      role={kind === "unavailable" ? "status" : undefined}
      className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}
      data-testid={props["data-testid"]}
    >
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-full border bg-muted text-muted-foreground",
          kind === "unavailable" && "border-warning/30 bg-warning-subtle text-warning"
        )}
      >
        <Icon icon={icon} size={20} />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-h3 text-foreground">{title}</p>
        <p className="text-ui text-muted-foreground">{description}</p>
      </div>
      {(primaryAction || secondaryAction) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {secondaryAction}
          {primaryAction}
        </div>
      )}
    </div>
  )
}
