import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface RewindFigureProps {
  /** The registry's deterministic `srSummary(data)` for the graphic. */
  summary: string
  children: ReactNode
  className?: string
}

/**
 * Wraps a page graphic (the clock, the calendar, bars) as one image with a
 * deterministic text alternative (Rewind design 11.1). Its children are
 * presentational to assistive technology; the Table sheet carries the data.
 */
export function RewindFigure({ summary, children, className }: RewindFigureProps) {
  return (
    <div role="img" aria-label={summary} data-testid="rewind-figure" className={cn("relative", className)}>
      {children}
    </div>
  )
}
