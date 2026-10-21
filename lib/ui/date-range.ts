/**
 * The `?from=` and `?to=` day keys of DateRangeFilter (ui-design-system 5.5).
 * Both are `YYYY-MM-DD` in the server zone and the end is inclusive, so
 * "Last 7 days" on 20 October is 14 to 20 October, and the page queries
 * `[from 00:00, the day after to 00:00)` in that zone.
 *
 * @module lib/ui/date-range
 */

import { z } from "zod"

import type { SearchParamsInput } from "@/lib/ui/table-params"
import { isWallTime, wallTimeToInstant } from "@/lib/utils/zoned-time"

export interface DayRange {
  from: string
  to: string
}

export const DAY_PRESETS = { "7d": 7, "30d": 30, "90d": 90 } as const
export type DayPreset = keyof typeof DAY_PRESETS

/** Whether `value` is a real calendar day as `YYYY-MM-DD`. */
export function isDayKey(value: string): boolean {
  return isWallTime(`${value}T00:00`)
}

/** `key` moved by `days` calendar days. @internal */
export function addDays(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** The last `n` days, ending today and including it. */
export function presetRange(preset: DayPreset, today: string): DayRange {
  return { from: addDays(today, -(DAY_PRESETS[preset] - 1)), to: today }
}

const dayKeySchema = z.string().refine(isDayKey)

/** The range in the URL, or null when either end is missing or bad, or the end is before the start. */
export function parseDateRange(input: SearchParamsInput, params = { from: "from", to: "to" }): DayRange | null {
  const read = (key: string) => {
    if (input instanceof URLSearchParams) return input.get(key) ?? undefined
    const value = input[key]
    return Array.isArray(value) ? value[0] : value
  }
  const from = dayKeySchema.safeParse(read(params.from))
  const to = dayKeySchema.safeParse(read(params.to))
  if (!from.success || !to.success || to.data < from.data) return null
  return { from: from.data, to: to.data }
}

/** The instants a range covers in `zone`: `gte` its first midnight, `lt` the midnight after its last day. */
export function dateRangeToInstants(range: DayRange, zone: string): { gte: Date; lt: Date } {
  return {
    gte: wallTimeToInstant(`${range.from}T00:00`, zone),
    lt: wallTimeToInstant(`${addDays(range.to, 1)}T00:00`, zone),
  }
}
