/**
 * The optical soundtrack (design 5.7, item 1): the year drawn as one column
 * per day, like the soundtrack strip printed on film.
 *
 * Pure geometry, shared by the pages and the cards: one step-area SVG path
 * (no per-day rectangles, so no moire at any scale), the centre line, a
 * dotted centre line for the days the data window has not reached yet
 * (December during the season), and the x of each month's first day for the
 * month initials, which the caller sets as text. It never emits `<text>`.
 *
 * ```
 *  half-height = height / 2 x sqrt(minutes / max)
 *    ▐▌ ▐▌▐▌▌ ▐▐▌        ......   <- days outside the window: dotted
 *  ──▐▌▐▌▐▌▌▐▐▐▌▐──────           <- centre line
 *    ▐▌ ▐▌▐▌▌ ▐▐▌
 *  J  F  M  A  ...  N  D          <- month anchors
 * ```
 *
 * `weekly` folds the year into 48 bins (the public cards' default), each
 * normalised the same way. `compare` (P8.4, `./soundtrack-compare`) draws this
 * year above the centre and last year mirrored below it, each as a trailing
 * 7-day average on one shared scale.
 *
 * @module lib/rewind/viz/soundtrack
 */

export interface SoundtrackOptions {
  variant: "daily" | "weekly"
  /** The year's first day (`YYYY-MM-DD`) and its length in days. */
  window: { from: string; days: number }
  width: number
  height: number
}

export interface Soundtrack {
  d: string
  /** The y of the centre line. */
  centre: number
  /** The days the window has not reached, as a dotted centre line; null after the final cut. */
  dotted: { x1: number; x2: number } | null
  /** Each month's first day: where its initial goes. */
  months: Array<{ month: number; x: number }>
  /** The 48 normalised bins (0-1) of the weekly variant; empty for daily. */
  bins: number[]
}

const WEEKLY_BINS = 48
const DAY_MS = 86_400_000

const r = (n: number) => Math.round(n * 100) / 100

/** Each month's first day as an x over the window; the compare variant reads it too. */
export function monthAnchors(from: string, days: number, width: number): Soundtrack["months"] {
  const start = Date.parse(`${from}T00:00:00Z`)
  const year = new Date(start).getUTCFullYear()
  return Array.from({ length: 12 }, (_, m) => ({ month: m + 1, x: r((((Date.UTC(year, m, 1) - start) / DAY_MS) * width) / days) }))
}

/** One step-area path over columns of equal width, mirrored about the centre. */
function stepArea(halves: readonly number[], column: number, centre: number): string {
  if (halves.length === 0) return ""
  const top = halves.map((h, i) => `V${r(centre - h)}H${r((i + 1) * column)}`).join("")
  const bottom = halves
    .map((h, i) => `V${r(centre + h)}H${r(i * column)}`)
    .reverse()
    .join("")
  return `M0,${r(centre)}${top}V${r(centre)}${bottom}V${r(centre)}Z`
}

function weeklyBins(minutes: readonly number[], days: number): { sums: number[]; drawn: number } {
  const sums = Array.from({ length: WEEKLY_BINS }, (_, b) => {
    const from = Math.floor((b * days) / WEEKLY_BINS)
    const to = Math.floor(((b + 1) * days) / WEEKLY_BINS)
    return minutes.slice(from, to).reduce((sum, m) => sum + m, 0)
  })
  const drawn = Math.min(WEEKLY_BINS, Math.ceil((minutes.length * WEEKLY_BINS) / days))
  return { sums, drawn }
}

/**
 * @param minutes - Minutes per day from the window's first day, one entry per day the window has reached.
 *
 * @example
 * ```ts
 * const strip = soundtrack([60, 0, 15], { variant: "daily", window: { from: "2026-01-01", days: 4 }, width: 4, height: 2 })
 * strip.d      // "M0,1V0H1V1H2V0.5H3V1V1.5H2V1H1V2H0V1Z"
 * strip.dotted // { x1: 3, x2: 4 }
 * ```
 */
export function soundtrack(minutes: readonly number[], { variant, window, width, height }: SoundtrackOptions): Soundtrack {
  const centre = height / 2
  const months = monthAnchors(window.from, window.days, width)
  const half = (value: number, max: number) => (max > 0 ? centre * Math.sqrt(value / max) : 0)

  if (variant === "weekly") {
    const { sums, drawn } = weeklyBins(minutes, window.days)
    const max = Math.max(0, ...sums.slice(0, drawn))
    const bins = sums.map((sum, b) => (b < drawn && max > 0 ? Math.sqrt(sum / max) : 0))
    const column = width / WEEKLY_BINS
    const d = stepArea(bins.slice(0, drawn).map((b) => b * centre), column, centre)
    return { d, centre, dotted: drawn < WEEKLY_BINS ? { x1: r(drawn * column), x2: width } : null, months, bins }
  }

  const column = width / window.days
  const max = Math.max(0, ...minutes)
  const d = stepArea(minutes.map((m) => half(m, max)), column, centre)
  const drawn = Math.min(minutes.length, window.days)
  return { d, centre, dotted: drawn < window.days ? { x1: r(drawn * column), x2: width } : null, months, bins: [] }
}

/**
 * The step-area path of bins already scaled 0-1 (the projection's weekly
 * bins, or the square root of its daily ones), mirrored about the centre:
 * how a share card draws the soundtrack it was given.
 *
 * @example
 * ```ts
 * binsPath([1, 0.5], 2, 2) // "M0,1V0H1V0.5H2V1V1.5H1V2H0V1Z"
 * ```
 */
export function binsPath(bins: readonly number[], width: number, height: number): string {
  const centre = height / 2
  return stepArea(bins.map((b) => b * centre), bins.length > 0 ? width / bins.length : 0, centre)
}

/** Days in the window's year: 365 or 366. */
export function yearDays(from: string): number {
  const year = Number(from.slice(0, 4))
  return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY_MS
}
