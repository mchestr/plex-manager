"use client"

import { useId, useState, type ReactNode } from "react"

import { RewindFigure } from "@/components/rewind/a11y/figure"
import { Toggle } from "@/components/ui/toggle"
import type { CompareSoundtrack } from "@/lib/rewind/viz/soundtrack-compare"
import { cn } from "@/lib/utils"

import { HatchDefs } from "./hatch"
import { ARTBOARD_TARGET, u, ut } from "./units"

interface NumberCompareProps {
  /** The page's own `srSummary`, the figure's label while the comparison is off. */
  summary: string
  /** "2026 above, 2025 below, as 7-day averages. ...": the label while it is on. */
  compareSummary: string
  /** Last year, for the toggle's label. */
  lastYear: number
  /** `soundtrackCompare` of both years, built on the server. */
  compare: Pick<CompareSoundtrack, "above" | "below" | "centre">
  width: number
  height: number
  /** The figure's heading and milestones. */
  children: ReactNode
  /** The daily strip the comparison crossfades from. */
  strip: ReactNode
  className?: string
}

const FADE = "transition-opacity duration-(--rw-dur-s) ease-(--rw-ease-data) motion-reduce:transition-none"

/**
 * "Compare with 2025" on page 02 (design 4.3, FR-11): a Toggle
 * (`aria-pressed`) under the road that crossfades the daily strip into both
 * years' 7-day averages, this year above the line and last year mirrored and
 * hatched below it, over 240 ms (at once under reduced motion). The figure's
 * label becomes the compare summary. It never turns the page
 * (`data-rw-interactive`).
 */
export function NumberCompare({ summary, compareSummary, lastYear, compare, width, height, children, strip, className }: NumberCompareProps) {
  const [on, setOn] = useState(false)
  const hatch = useId()

  return (
    <div className={cn("flex flex-col", className)}>
      <div data-rw-interactive className="flex justify-end" style={{ marginBottom: u(6) }}>
        <Toggle
          pressed={on}
          onPressedChange={setOn}
          className={cn(ARTBOARD_TARGET, "h-[calc(var(--u)*32px)] rounded-full border-current px-[calc(var(--u)*12px)] font-display text-current")}
          style={{ fontSize: ut(13) }}
          data-testid="rewind-compare-2025"
        >
          Compare with {lastYear}
        </Toggle>
      </div>
      <RewindFigure summary={on ? compareSummary : summary}>
        {children}
        <div className="relative" data-compare={on || undefined} data-testid="rewind-compare-strip">
          <div className={cn(FADE, on && "opacity-0")}>{strip}</div>
          <svg
            aria-hidden
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className={cn(FADE, "absolute inset-0 block size-full", !on && "opacity-0")}
            style={{ width: u(width) }}
          >
            <HatchDefs id={hatch} />
            <path d={compare.above} fill="currentColor" />
            <path d={compare.below} fill={`url(#${hatch})`} />
            <line x1={0} x2={width} y1={compare.centre} y2={compare.centre} stroke="currentColor" strokeWidth={1.5} />
          </svg>
        </div>
      </RewindFigure>
    </div>
  )
}
