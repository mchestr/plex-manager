"use client"

import type { CSSProperties } from "react"

import { cn } from "@/lib/utils"

interface ProgressProps {
  /** Each selected page's dwell in ms, or null for a page that waits instead. */
  dwells: readonly (number | null)[]
  index: number
  playing: boolean
  slowerPacing: boolean
  onDwellEnd: () => void
}

/**
 * One decorative segment per page (design 4.6): done segments are solid,
 * the current one fills over the page's dwell, upcoming ones are 30% ink.
 * The fill is the `rw-progress` CSS animation, paused and resumed through
 * `data-playing`, and its `animationend` turns the page, so a dwell costs no
 * React render (RWV-13).
 */
export function Progress({ dwells, index, playing, slowerPacing, onDwellEnd }: ProgressProps) {
  return (
    <div aria-hidden className="flex h-[3px] gap-[3px]" data-testid="rewind-progress">
      {dwells.map((dwell, i) => {
        const timed = i === index && dwell !== null
        return (
          <span key={i} className="relative flex-1 overflow-hidden rounded-[2px] bg-foreground/30">
            <span
              data-testid={i === index ? "rewind-progress-current" : undefined}
              data-playing={timed ? String(playing) : undefined}
              className={cn(
                "absolute inset-0 origin-left bg-foreground",
                timed ? "rw-progress" : i <= index ? "scale-x-100" : "scale-x-0"
              )}
              style={timed ? ({ "--rw-dwell": `${dwell * (slowerPacing ? 1.5 : 1)}ms` } as CSSProperties) : undefined}
              onAnimationEnd={timed ? onDwellEnd : undefined}
            />
          </span>
        )
      })}
    </div>
  )
}
