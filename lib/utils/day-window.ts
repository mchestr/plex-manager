/**
 * Day windows for daily charts and period totals, in one IANA zone.
 *
 * ## Overview
 *
 * A daily chart needs three things that must agree: the UTC instants to query
 * (`gte` the first midnight, `lt` the midnight after the last day), the list
 * of day keys to draw (every day, inclusive, even the quiet ones), and the
 * day key each row falls on. All three come from `zoned-time.ts` through
 * `lib/ui/date-range.ts`, so there is one zone implementation:
 *
 * ```
 *   ?from=2026-10-01&to=2026-10-17        (DateRangeFilter, inclusive end)
 *            │
 *     dayWindow(range, zone)
 *            ├─ gte 2026-10-01T07:00Z ─┐
 *            ├─ lt  2026-10-18T07:00Z ─┴─ the Prisma `createdAt` filter
 *            └─ keys 2026-10-01 … 2026-10-17 (17 days)
 *                       │
 *   sumByDay(rows, zone) ─┴─ zeroFill(keys, sums, empty) → one entry per key
 * ```
 *
 * ## Special cases
 *
 * - Labels come from `formatDayKey`, never `new Date("YYYY-MM-DD")`, which is
 *   UTC midnight and prints as the day before west of Greenwich.
 * - A midnight that a DST change skips moves forward with `wallTimeToInstant`,
 *   so a day can be 23 or 25 hours long; the key list never skips or repeats.
 * - Rows outside the keys (a bound a caller widened) are dropped by `zeroFill`.
 *
 * Pure and safe to import on the client.
 *
 * @module lib/utils/day-window
 */

import { addDays, dateRangeToInstants, type DayRange } from "@/lib/ui/date-range"
import { formatDayKey, type FormatSettings } from "@/lib/utils/format"
import { dayKey } from "@/lib/utils/zoned-time"

export interface DayWindow extends DayRange {
  zone: string
  /** The first midnight of `from` in the zone, inclusive. */
  gte: Date
  /** The midnight after `to` in the zone, exclusive. */
  lt: Date
  /** Every day from `from` to `to`, inclusive, as `YYYY-MM-DD`. */
  keys: string[]
}

/** Every day key from `from` to `to`, inclusive. @internal */
export function dayKeys({ from, to }: DayRange): string[] {
  const keys: string[] = []
  for (let key = from; key <= to; key = addDays(key, 1)) keys.push(key)
  return keys
}

/**
 * The window for an inclusive day range in `zone`.
 *
 * @example
 * ```ts
 * const w = dayWindow({ from: "2026-10-01", to: "2026-10-17" }, "America/Los_Angeles")
 * w.gte.toISOString() // "2026-10-01T07:00:00.000Z"
 * w.lt.toISOString()  // "2026-10-18T07:00:00.000Z"
 * w.keys.length       // 17
 * ```
 */
export function dayWindow(range: DayRange, zone: string): DayWindow {
  const { gte, lt } = dateRangeToInstants(range, zone)
  return { ...range, zone, gte, lt, keys: dayKeys(range) }
}

/**
 * The last `days` days in `zone`, ending today and including it.
 *
 * @public P10.5's Discord default range and P10.8's Overview read it.
 *
 * @example
 * ```ts
 * const w = defaultWindow(30, "UTC", Date.parse("2026-10-17T18:00:00Z"))
 * [w.from, w.to] // ["2026-09-18", "2026-10-17"]
 * ```
 */
export function defaultWindow(days: number, zone: string, now: number = Date.now()): DayWindow {
  const to = dayKey(now, zone)
  return dayWindow({ from: addDays(to, -(days - 1)), to }, zone)
}

/**
 * From the day of `first` (the oldest row) through today, for "Any time";
 * today alone when there are no rows.
 */
export function windowSince(first: Date | null, zone: string, now: number = Date.now()): DayWindow {
  const to = dayKey(now, zone)
  const from = first ? dayKey(first.getTime(), zone) : to
  return dayWindow({ from: from < to ? from : to, to }, zone)
}

/**
 * Sums `value(row)` (1 when omitted, a count) by the zone day of `at(row)`.
 *
 * @example
 * ```ts
 * sumByDay([{ at: new Date("2026-10-17T06:00:00Z") }], "America/Los_Angeles", (r) => r.at)
 * // Map { "2026-10-16" => 1 }
 * ```
 */
export function sumByDay<T>(
  rows: Iterable<T>,
  zone: string,
  at: (row: T) => Date,
  value: (row: T) => number = () => 1,
): Map<string, number> {
  const sums = new Map<string, number>()
  for (const row of rows) {
    const key = dayKey(at(row).getTime(), zone)
    sums.set(key, (sums.get(key) ?? 0) + value(row))
  }
  return sums
}

/**
 * One entry per key, in key order: the row for that day, or `empty` on a day
 * with none. Rows for days outside `keys` are dropped.
 *
 * @example
 * ```ts
 * zeroFill(["2026-10-16", "2026-10-17"], new Map([["2026-10-17", { count: 2 }]]), { count: 0 })
 * // [{ date: "2026-10-16", count: 0 }, { date: "2026-10-17", count: 2 }]
 * ```
 */
export function zeroFill<T extends object>(
  keys: readonly string[],
  rows: ReadonlyMap<string, T>,
  empty: T,
): Array<{ date: string } & T> {
  return keys.map((date) => ({ date, ...(rows.get(date) ?? empty) }))
}

/**
 * The period a window covers, for a page header: "Oct 1 – Oct 17, 2026", or
 * with both years when they differ, from the inclusive last day.
 *
 * @example
 * ```ts
 * formatPeriod({ from: "2026-10-01", to: "2026-10-17" }, { locale: "en-US" }) // "Oct 1 – Oct 17, 2026"
 * formatPeriod({ from: "2026-10-17", to: "2026-10-17" }, { locale: "en-US" }) // "Oct 17, 2026"
 * ```
 */
export function formatPeriod({ from, to }: DayRange, settings: Pick<FormatSettings, "locale">): string {
  const last = formatDayKey(to, "short", settings)
  if (from === to) return last
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  return `${formatDayKey(from, sameYear ? "day-month-short" : "short", settings)} – ${last}`
}
