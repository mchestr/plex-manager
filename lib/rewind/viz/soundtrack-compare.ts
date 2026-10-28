/**
 * The optical soundtrack's `compare` variant (design 4.3 page 02, P8.4):
 * this year above the centre line, solid, and last year mirrored below it,
 * hatched, each smoothed to a trailing 7-day average on one shared scale.
 *
 * ```
 *    ▄▆█▇▅▃▂▃▅▆▇         <- 2026, 7-day averages
 *  ──────────────────     <- centre line
 *    ▀▀▜▛▀▀▀▀▜▛▀         <- 2025, mirrored, hatched by the page
 * ```
 *
 * Both years are read over the same window: the shorter of the two series,
 * which is 1 January to 30 November during the season (what `time.vsLastYear`
 * counts) and the full years in a whole-year issue. Pure geometry: no `<text>`.
 *
 * @module lib/rewind/viz/soundtrack-compare
 */

import { monthAnchors, type Soundtrack } from "./soundtrack"

/** The trailing average's length in days. */
const AVERAGE_DAYS = 7
const DAY_MS = 86_400_000

const r = (n: number) => Math.round(n * 100) / 100

export interface CompareOptions {
  variant: "compare"
  /** The year's first day (`YYYY-MM-DD`) and its length in days. */
  window: { from: string; days: number }
  width: number
  height: number
}

export interface CompareSoundtrack {
  /** This year, above the centre line. */
  above: string
  /** Last year, mirrored below the centre line. */
  below: string
  centre: number
  /** The days both years are compared over. */
  days: number
  /** The shared scale: the largest 7-day average of either year, in minutes. */
  max: number
  /** Where each year's label goes: the tip of its tallest average. */
  legend: { above: { x: number; y: number }; below: { x: number; y: number } }
  months: Soundtrack["months"]
}

/**
 * Each day's trailing 7-day average; the days before the first count as
 * nothing watched.
 *
 * @internal Exported for its test.
 *
 * @example
 * ```ts
 * trailingAverage([7, 7, 0, 0, 0, 0, 0, 0]) // [1, 2, 2, 2, 2, 2, 2, 1]
 * ```
 */
export function trailingAverage(minutes: readonly number[]): number[] {
  let sum = 0
  return minutes.map((m, i) => {
    sum += m - (i >= AVERAGE_DAYS ? minutes[i - AVERAGE_DAYS] : 0)
    return r(sum / AVERAGE_DAYS)
  })
}

/** A step-area path from the centre line to `centre + sign * h` in each column. */
function halfArea(heights: readonly number[], column: number, centre: number, sign: 1 | -1): string {
  if (heights.length === 0) return ""
  const steps = heights.map((h, i) => `V${r(centre + sign * h)}H${r((i + 1) * column)}`).join("")
  return `M0,${r(centre)}${steps}V${r(centre)}Z`
}

const peakIndex = (values: readonly number[]) => values.reduce((best, v, i) => (v > values[best] ? i : best), 0)

/**
 * Both years' strips. Heights follow the square root of the average, as the
 * daily strip's do, against the larger of the two peaks.
 *
 * @example
 * ```ts
 * const strip = soundtrackCompare([7, 7], [0, 14], { variant: "compare", window: { from: "2026-01-01", days: 2 }, width: 2, height: 4 })
 * strip.above // "M0,2V0.59H1V0H2V2Z"
 * strip.below // "M0,2V2H1V4H2V2Z"
 * ```
 */
export function soundtrackCompare(current: readonly number[], lastYear: readonly number[], { window, width, height }: CompareOptions): CompareSoundtrack {
  const centre = height / 2
  const days = Math.min(current.length, lastYear.length, window.days)
  const now = trailingAverage(current.slice(0, days))
  const then = trailingAverage(lastYear.slice(0, days))
  const max = Math.max(0, ...now, ...then)
  const half = (value: number) => (max > 0 ? centre * Math.sqrt(value / max) : 0)
  const column = width / window.days
  const peakNow = peakIndex(now)
  const peakThen = peakIndex(then)
  return {
    above: halfArea(now.map(half), column, centre, -1),
    below: halfArea(then.map(half), column, centre, 1),
    centre,
    days,
    max,
    legend: {
      above: { x: r(peakNow * column), y: r(centre - half(now[peakNow] ?? 0)) },
      below: { x: r(peakThen * column), y: r(centre + half(then[peakThen] ?? 0)) },
    },
    months: monthAnchors(window.from, window.days, width),
  }
}

/**
 * How many of the compared months this year was ahead in, by total minutes;
 * a month counts once the window reaches any of its days.
 *
 * @example
 * ```ts
 * monthsAhead([10, 10], [5, 20], "2026-01-01") // { ahead: 0, months: 1 }
 * ```
 */
export function monthsAhead(current: readonly number[], lastYear: readonly number[], from: string): { ahead: number; months: number } {
  const days = Math.min(current.length, lastYear.length)
  const start = Date.parse(`${from}T00:00:00Z`)
  const totals = new Map<number, [number, number]>()
  for (let i = 0; i < days; i++) {
    const month = new Date(start + i * DAY_MS).getUTCMonth()
    const [a, b] = totals.get(month) ?? [0, 0]
    totals.set(month, [a + current[i], b + lastYear[i]])
  }
  return { ahead: [...totals.values()].filter(([a, b]) => a > b).length, months: totals.size }
}

/**
 * The figure's label with the comparison on.
 *
 * @example
 * ```ts
 * compareSummary({ year: 2026, ahead: 9, months: 11 })
 * // "2026 above, 2025 below, as 7-day averages. 2026 was ahead in 9 of 11 months."
 * ```
 */
export function compareSummary({ year, ahead, months }: { year: number; ahead: number; months: number }): string {
  const lead = `${year} above, ${year - 1} below, as 7-day averages.`
  return months > 0 ? `${lead} ${year} was ahead in ${ahead} of ${months} ${months === 1 ? "month" : "months"}.` : lead
}
