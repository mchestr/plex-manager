/**
 * The calendar strip (design 4.3 page 10, 5.7 item 4): one row per month of
 * the window, one column per day of the month, each cell in one of four
 * print steps.
 *
 * ```
 *  J ▢▢▨■■▨▢ ...        blank    no such day (30 February), or outside the window
 *  F ■■■■■■■ ...  ◯     outline  in the window, nothing played
 *     └─streak─┘         hatch    played, under the median active day
 *  M ▢▢▢......▢▢        solid    the median active day or more
 * ```
 *
 * The streak is bracketed above its cells, the biggest day is ringed and the
 * longest gap is underlined with dots; each mark that crosses a month end
 * splits into one segment per row. Pure geometry: the caller draws the
 * hatch as an SVG `<pattern>` in `currentColor`.
 *
 * @module lib/rewind/viz/calendar
 */

type CellStep = "outline" | "hatch" | "solid"

export interface CalendarCell {
  date: string
  month: number
  day: number
  x: number
  y: number
  step: CellStep
}

interface CalendarSegment {
  x1: number
  x2: number
  y: number
}

export interface CalendarGrid {
  rows: number
  width: number
  height: number
  cells: CalendarCell[]
  streak: CalendarSegment[]
  biggest: { cx: number; cy: number; r: number } | null
  gap: CalendarSegment[]
}

interface CalendarOptions {
  cell: number
  gap: number
  streak: { from: string; to: string } | null
  biggest: string | null
  longestGap: { from: string; to: string } | null
}

const r = (n: number) => Math.round(n * 100) / 100
const DAYS = 31

/** The middle positive value: the line between hatch and solid. */
function median(values: number[]): number {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return Infinity
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** @internal */
export function cellStep(minutes: number, threshold: number): CellStep {
  if (minutes <= 0) return "outline"
  return minutes >= threshold ? "solid" : "hatch"
}

/**
 * @param days every day of the window in order, `YYYY-MM-DD` with its minutes
 */
export function calendarGrid(days: ReadonlyArray<{ date: string; minutes: number }>, opts: CalendarOptions): CalendarGrid {
  const pitch = opts.cell + opts.gap
  const threshold = median(days.map((d) => d.minutes))
  const firstMonth = days.length > 0 ? Number(days[0].date.slice(5, 7)) : 1
  const place = (date: string) => {
    const month = Number(date.slice(5, 7))
    const day = Number(date.slice(8, 10))
    return { month, day, x: r((day - 1) * pitch), y: r((month - firstMonth) * pitch) }
  }
  const cells = days.map((d) => ({ date: d.date, ...place(d.date), step: cellStep(d.minutes, threshold) }))
  const rows = cells.length > 0 ? cells[cells.length - 1].month - firstMonth + 1 : 0
  const index = new Map(cells.map((cell, i) => [cell.date, i]))

  /** One segment per row the run of dates crosses, at `dy` from the row's top. */
  const segments = (run: { from: string; to: string } | null, dy: number): CalendarSegment[] => {
    const from = run ? index.get(run.from) : undefined
    const to = run ? index.get(run.to) : undefined
    if (from === undefined || to === undefined) return []
    const out: CalendarSegment[] = []
    for (let i = from; i <= to; i++) {
      const cell = cells[i]
      const last = out[out.length - 1]
      if (last && last.y === r(cell.y + dy)) last.x2 = r(cell.x + opts.cell)
      else out.push({ x1: cell.x, x2: r(cell.x + opts.cell), y: r(cell.y + dy) })
    }
    return out
  }

  const big = opts.biggest ? index.get(opts.biggest) : undefined
  return {
    rows,
    width: r(DAYS * pitch - opts.gap),
    height: r(rows * pitch - opts.gap),
    cells,
    streak: segments(opts.streak, -opts.gap / 2),
    biggest: big === undefined ? null : { cx: r(cells[big].x + opts.cell / 2), cy: r(cells[big].y + opts.cell / 2), r: r(opts.cell * 0.85) },
    gap: segments(opts.longestGap, opts.cell + opts.gap / 2),
  }
}
