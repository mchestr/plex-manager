/**
 * The evidence clock (design 5.3, 5.7 item 2): 24 radial bars, one per start
 * hour, with midnight at the top and the hours running clockwise.
 *
 * Pure geometry, shared by page 09, the centrefold and the cards:
 *
 * ```
 *                 midnight
 *        leader ─┐  ╭──arc──╮        the arc brackets the archetype's
 *   10 PM ───────┘ ▌▌▌ ▌            window (22:00 to 03:59 after dark)
 *   6 PM   ▬▬     ( 34% )    ▬  6 AM
 *               ▐ ▐ ▐ ▐
 *                  noon
 * ```
 *
 * - A bar's length is `minLength + (maxLength - minLength) x sqrt(count / max)`,
 *   so its area, not its height, reads as the count, and an empty hour
 *   keeps a nub.
 * - Each bar is a rect standing on the inner radius at 12 o'clock, rotated
 *   to its hour about the centre; it spans 15 degrees of the dial.
 * - The arc runs from the first hour's leading edge to the last hour's
 *   trailing edge, wrapping past midnight.
 * - The leader leaves the peak bar's tip radially, then runs level to the
 *   nearer side of the box, where the caller sets the peak label.
 * - Label anchors sit outside the arc at midnight, 6 AM, noon and 6 PM.
 *
 * It returns numbers only and never emits `<text>`.
 *
 * @module lib/rewind/viz/hour-ring
 */

export interface HourRingOptions {
  /** The square box in px. */
  size: number
  /** The archetype's window, in start hours, inclusive: `{ from: 22, to: 3 }`. */
  arc: { from: number; to: number }
  /** The hour the leader points at; null draws no leader. */
  peak: number | null
  /** How far the leader runs past each side of the box, to the label. */
  gutter: number
}

interface RingBar {
  hour: number
  /** Degrees clockwise from midnight. */
  angle: number
  x: number
  y: number
  width: number
  height: number
  inArc: boolean
}

export interface HourRing {
  centre: number
  bars: RingBar[]
  arc: { startAngle: number; endAngle: number; d: string }
  leader: { d: string; x: number; y: number; side: "left" | "right" } | null
  labels: Array<{ hour: 0 | 6 | 12 | 18; x: number; y: number }>
}

/** Proportions of the 256 px mockup ring. */
const INNER = 54 / 256
const MAX_LENGTH = 56 / 256
const MIN_LENGTH = 2.5 / 256
const BAR_WIDTH = 9 / 256
const ARC_RADIUS = 118 / 256
const LABEL_RADIUS = 128 / 256
const LEADER_RUN = 14 / 256
const STEP = 15

const r = (n: number) => Math.round(n * 100) / 100

const point = (c: number, radius: number, angle: number) => {
  const a = (angle * Math.PI) / 180
  return { x: r(c + radius * Math.sin(a)), y: r(c - radius * Math.cos(a)) }
}

/** Whether `hour` is inside the inclusive window, which may wrap past midnight. @internal */
export function inWindow(hour: number, { from, to }: { from: number; to: number }): boolean {
  return from <= to ? hour >= from && hour <= to : hour >= from || hour <= to
}

/** The bar length for each hour, square-rooted against the busiest. @internal */
export function barLengths(histogram: readonly number[], size: number): number[] {
  const max = Math.max(0, ...histogram)
  const min = MIN_LENGTH * size
  return histogram.map((count) => r(min + (MAX_LENGTH * size - min) * (max > 0 ? Math.sqrt(count / max) : 0)))
}

export function hourRing(histogram: readonly number[], { size, arc, peak, gutter }: HourRingOptions): HourRing {
  const c = size / 2
  const inner = INNER * size
  const width = BAR_WIDTH * size
  const lengths = barLengths(histogram, size)
  const bars = lengths.map((height, hour) => ({
    hour,
    angle: hour * STEP,
    x: r(c - width / 2),
    y: r(c - inner - height),
    width: r(width),
    height,
    inArc: inWindow(hour, arc),
  }))

  const startAngle = arc.from * STEP - STEP / 2
  const span = (((arc.to - arc.from + 24) % 24) + 1) * STEP
  const endAngle = startAngle + span
  const radius = ARC_RADIUS * size
  const a = point(c, radius, startAngle)
  const b = point(c, radius, endAngle)
  const d = `M${a.x} ${a.y} A${r(radius)} ${r(radius)} 0 ${span > 180 ? 1 : 0} 1 ${b.x} ${b.y}`

  let leader: HourRing["leader"] = null
  if (peak !== null) {
    const tip = point(c, inner + lengths[peak] + LEADER_RUN * size * 0.3, peak * STEP)
    const elbow = point(c, inner + lengths[peak] + LEADER_RUN * size, peak * STEP)
    const side = tip.x < c ? "left" : "right"
    const x = side === "left" ? -gutter : size + gutter
    leader = { d: `M${tip.x} ${tip.y} L${elbow.x} ${elbow.y} L${x} ${elbow.y}`, x, y: elbow.y, side }
  }

  const labels = ([0, 6, 12, 18] as const).map((hour) => ({ hour, ...point(c, LABEL_RADIUS * size, hour * STEP) }))
  return { centre: c, bars, arc: { startAngle, endAngle, d }, leader, labels }
}
