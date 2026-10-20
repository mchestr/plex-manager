import type { CSSProperties } from "react"

import { hourRing } from "@/lib/rewind/viz/hour-ring"
import { cn } from "@/lib/utils"

import { axes, u, ut } from "./units"

const FACE: Record<0 | 6 | 12 | 18, { label: string; place: string }> = {
  0: { label: "midnight", place: "-translate-x-1/2 -translate-y-full" },
  6: { label: "6\u00A0AM", place: "translate-x-[30%] -translate-y-1/2" },
  12: { label: "noon", place: "-translate-x-1/2" },
  18: { label: "6\u00A0PM", place: "-translate-x-[130%] -translate-y-1/2" },
}

/**
 * A clock-face label's line box: its text size at a line height of 1. "noon"
 * hangs this far below the ring's box, so whatever follows the ring leaves
 * this much room above it.
 */
export const RING_LABEL = ut(12.5)

interface HourRingFigureProps {
  hours: readonly number[]
  arc: { from: number; to: number }
  peak: number | null
  /** The share in the centre ("34%") and what it counts. */
  share: string
  caption: string
  /** `hours.peak`'s display, for the leader label. */
  peakLabel: string
  /** The ring's box in logical px; the leader runs `gutter` px past each side. */
  size: number
  gutter: number
  /**
   * The hours outside the window: solid in the ink where the spot is its own
   * colour (the centrefold), outlined on a two-ink page whose spot is its ink.
   */
  rest: "solid" | "outline"
  /**
   * Take the height the parent leaves, up to `size`, and stay square: the
   * centrefold's ring gives way when floored text fills its artboard (below
   * the 0.8 scale floor, design 4.7). The parent sets a definite height.
   */
  fit?: boolean
}

/**
 * The evidence clock (design 5.3, 5.7): 24 bars from `lib/rewind/viz/hour-ring`
 * in the page's ink, the archetype's window in its spot colour with the arc
 * bracketing it, the share in the centre, the clock-face labels and the peak
 * hour's leader label. Decorative: the page wraps it in `RewindFigure`, whose
 * summary and Table carry the numbers.
 *
 * Motion: the bars appear clockwise from midnight (30 ms an hour), then the
 * arc and the leader; reduced motion shows the final state.
 */
export function HourRingFigure({ hours, arc, peak, share, caption, peakLabel, size, gutter, rest, fit = false }: HourRingFigureProps) {
  const ring = hourRing(hours, { size, arc, peak, gutter })
  const at = (n: number) => `${(n / size) * 100}%`
  // A container, so the centre sizes in `cqw` and keeps its place in a fitted ring
  const box: CSSProperties = fit
    ? { height: "100%", maxHeight: u(size), aspectRatio: "1", containerType: "size" }
    : { width: u(size), height: u(size), containerType: "size" }

  return (
    <div aria-hidden className="relative mx-auto" style={box}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 size-full overflow-visible">
        {ring.bars.map((bar) => (
          <rect
            key={bar.hour}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            rx={1.5}
            transform={`rotate(${bar.angle} ${ring.centre} ${ring.centre})`}
            strokeWidth={rest === "outline" && !bar.inArc ? 1.5 : 0}
            className={cn("rw-ring-bar", bar.inArc ? "fill-chart-2" : rest === "outline" ? "fill-none stroke-current" : "fill-current")}
            style={{ animationDelay: `${420 + bar.hour * 30}ms` }}
          />
        ))}
        <path d={ring.arc.d} fill="none" strokeWidth={3.5} strokeLinecap="round" className="rw-ring-arc stroke-chart-2" />
        {ring.leader && <path d={ring.leader.d} fill="none" strokeWidth={1.5} className="rw-ring-arc stroke-current" />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <b className="font-display tabular-nums" style={{ fontSize: "15cqw", lineHeight: 0.9, fontVariationSettings: axes(75, 900) }}>
          {share}
        </b>
        <span className="italic" style={{ fontSize: ut(13), lineHeight: 1.15, marginTop: u(3), maxWidth: "42cqw" }}>
          {caption}
        </span>
      </div>
      {ring.labels.map((label) => (
        <span
          key={label.hour}
          className={cn("absolute whitespace-nowrap font-display", FACE[label.hour].place)}
          style={{ left: at(label.x), top: at(label.y), fontSize: RING_LABEL, lineHeight: 1, fontVariationSettings: axes(100, 650) }}
        >
          {FACE[label.hour].label}
        </span>
      ))}
      {ring.leader && (
        <span
          className={cn("rw-ring-arc absolute -translate-y-full whitespace-nowrap font-display", ring.leader.side === "left" ? "text-left" : "-translate-x-full text-right")}
          style={{ left: at(ring.leader.x), top: at(ring.leader.y), fontSize: u(15), lineHeight: 1.1, fontVariationSettings: axes(87.5, 760) }}
        >
          {peakLabel}
          <em className="block font-text font-normal" style={{ fontSize: ut(14), fontVariationSettings: "normal" }}>
            your busiest hour
          </em>
        </span>
      )}
    </div>
  )
}
