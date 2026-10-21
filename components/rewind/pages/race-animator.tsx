"use client"

import { useReducedMotion } from "motion/react"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react"

import { useStagePage } from "@/components/rewind/stage/stage-page"
import { TURN_MS } from "@/lib/rewind/page-meta"
import { BAR_TWEEN_MS, frameKeyframes, ORDER_TWEEN_MS, raceDurationMs, type RaceRow } from "@/lib/rewind/viz/race"

import { HatchDefs } from "./hatch"
import { axes, MEASURE, u, ut } from "./units"

// The scrubber's island loads only once its controls show (P8.3), outside the first page's budget.
const RaceControls = dynamic(() => import("./race-controls").then((m) => m.RaceControls), { ssr: false })

const BAR_H = 12
const CLOCK_LINE = 30

interface RaceAnimatorRow {
  key: string
  /** The title as typeset on the server, above its bar. */
  title: ReactNode
  geometry: RaceRow
  /** The final leader's bar prints solid, the others hatched. */
  solid: boolean
}

interface RaceAnimatorProps {
  rows: readonly RaceAnimatorRow[]
  /** The race clock's month labels, one per frame ("30 Nov" style or "November"). */
  months: readonly string[]
  /** Row pitch in logical px. */
  pitch: number
  /** The scrubber's live line per frame ("Standings after August: ..."). */
  standings?: readonly string[]
  /** `race.scrubber` (P8.3): the scrubber and Replay show after the run. */
  scrubber?: boolean
  /** The who-led strip, between the bars and the controls. */
  children?: ReactNode
}

const ease = "cubic-bezier(0.2, 0, 0, 1)"
/** A row moved down `rank` places: each lane is one pitch tall. */
const lane = (rank: number) => `translateY(${rank * 100}%)`
/** The month clock showing frame `i` of `n`: its column of months moved up `i` lines. */
const tick = (i: number, n: number) => `translateY(${(-i / n) * 100}%)`

/**
 * The race's client island (design 4.3 page 11): the rows sit at their
 * final standings as rendered, and on the first visit only, the 11 frames
 * play once with `element.animate()` on refs: each bar's `scaleX` tweens
 * over 420 ms, rows re-order over 360 ms and the month clock steps, one
 * frame every 520 ms after the page turn. Nothing sets React state during
 * the run, so the story commits no render for it. A revisit, reduced
 * motion, or leaving the page mid-run shows the final frame.
 *
 * With `scrubber` on (P8.3), the controls show once the run has ended, or at
 * once under reduced motion or on a revisit. `seek(frame)` sets each bar's
 * `scaleX`, each lane's `translateY` and the clock straight on the elements,
 * and Replay plays the months again from January.
 */
export function RaceAnimator({ rows, months, pitch, standings = [], scrubber = false, children }: RaceAnimatorProps) {
  const hatch = useId()
  const current = useStagePage().distance === 0
  const reduce = useReducedMotion()
  const played = useRef(false)
  const bars = useRef<Array<SVGRectElement | null>>([])
  const lanes = useRef<Array<HTMLDivElement | null>>([])
  const clock = useRef<HTMLSpanElement | null>(null)
  const runs = useRef<Animation[]>([])
  const [ran, setRan] = useState(false)
  const last = months.length - 1

  const stop = useCallback(() => {
    runs.current.forEach((a) => a.cancel())
    runs.current = []
  }, [])

  /** Sets every element at `frame`; the rendered resting frame is the last. */
  const seek = useCallback(
    (frame: number) => {
      stop()
      rows.forEach((row, i) => {
        const bar = bars.current[i]
        const laneEl = lanes.current[i]
        if (bar) bar.style.transform = `scaleX(${row.geometry.scale[frame]})`
        if (laneEl) laneEl.style.transform = lane(row.geometry.offset[frame] / pitch)
      })
      if (clock.current) clock.current.style.transform = tick(frame, months.length)
    },
    [rows, months.length, pitch, stop]
  )

  /** Plays every frame from January after `delay` ms; settles when the run ends or is stopped. */
  const play = useCallback(
    (delay: number) => {
      stop()
      const timing = { duration: raceDurationMs(months.length), delay, fill: "backwards" as const }
      const run = (el: Element | null, keyframes: Keyframe[]) => {
        if (el && typeof el.animate === "function") runs.current.push(el.animate(keyframes, timing))
      }
      rows.forEach((row, i) => {
        run(
          bars.current[i],
          frameKeyframes(row.geometry.scale, BAR_TWEEN_MS, 0).map(({ offset, value }) => ({ offset, transform: `scaleX(${value})`, easing: ease }))
        )
        run(
          lanes.current[i],
          frameKeyframes(row.geometry.offset, ORDER_TWEEN_MS, row.geometry.offset[0]).map(({ offset, value }) => ({ offset, transform: lane(value / pitch), easing: ease }))
        )
      })
      run(
        clock.current,
        frameKeyframes(
          months.map((_m, i) => i),
          0,
          0
        ).map(({ offset, value }) => ({ offset, transform: tick(value, months.length) }))
      )
      return Promise.allSettled(runs.current.map((a) => a.finished))
    },
    [rows, months, pitch, stop]
  )

  useEffect(() => {
    if (!current || played.current) return
    played.current = true
    if (reduce) return
    void play(TURN_MS).then(() => setRan(true))
    return stop
  }, [current, reduce, play, stop])

  const replay = () => {
    seek(last)
    void play(0)
  }

  return (
    <div data-testid="rewind-race-animator">
      <p className="flex items-baseline font-display" style={{ gap: u(8), fontVariationSettings: axes(125, 760) }}>
        <span style={{ fontSize: ut(14) }}>Standings after</span>
        <span className="relative block overflow-hidden" style={{ height: u(CLOCK_LINE), fontSize: u(24), lineHeight: u(CLOCK_LINE) }}>
          <span ref={clock} className="block" style={{ transform: tick(last, months.length) }}>
            {months.map((month, i) => (
              <span key={i} className="block whitespace-nowrap" data-testid={i === last ? "rewind-race-clock" : undefined}>
                {month}
              </span>
            ))}
          </span>
        </span>
      </p>
      <div className="relative" style={{ height: u(pitch * rows.length), marginTop: u(8) }}>
        <svg aria-hidden className="absolute size-0">
          <HatchDefs id={hatch} />
        </svg>
        {rows.map((row, i) => (
          <div
            key={row.key}
            ref={(el) => {
              lanes.current[i] = el
            }}
            className="absolute inset-x-0 top-0"
            style={{ height: u(pitch), transform: lane(row.geometry.offset.at(-1)! / pitch) }}
            data-testid="rewind-race-row"
          >
            {row.title}
            <svg viewBox={`0 0 ${MEASURE} ${BAR_H}`} preserveAspectRatio="none" className="block w-full" style={{ height: u(BAR_H), marginTop: u(3) }}>
              <rect
                ref={(el) => {
                  bars.current[i] = el
                }}
                x={0.75}
                y={0.75}
                width={MEASURE - 1.5}
                height={BAR_H - 1.5}
                fill={row.solid ? "currentColor" : `url(#${hatch})`}
                stroke="currentColor"
                strokeWidth={row.solid ? 0 : 1.5}
                style={{ transformBox: "fill-box", transformOrigin: "left", transform: `scaleX(${row.geometry.scale.at(-1)})` }}
              />
            </svg>
          </div>
        ))}
      </div>
      {children}
      {scrubber && (ran || reduce) && <RaceControls months={months} standings={standings} onSeek={seek} onReplay={replay} />}
    </div>
  )
}
