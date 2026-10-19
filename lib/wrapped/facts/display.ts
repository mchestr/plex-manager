/**
 * A fact's display string, from its unit and raw value: the one place a fact
 * becomes text. Every rule comes from `lib/rewind/format.ts` (design 4.9:
 * U+00A0 between a number and its unit, plurals, "under 1%", hero numbers in
 * full, floored durations), which extends `lib/utils/format.ts`.
 *
 * @module lib/wrapped/facts/display
 */

import {
  formatCount,
  formatDayMonth,
  formatHero,
  formatHour,
  formatRewindDuration,
  formatShare,
} from "@/lib/rewind/format"
import { formatDuration, formatNumber } from "@/lib/utils/format"

/**
 * What a fact's value measures, which decides how it reads:
 *
 * | Unit | Value | Display (en-US) |
 * |---|---|---|
 * | `hours` | whole hours | "1,307" |
 * | `duration` | minutes | "3 h 54 m", "48 minutes" |
 * | `days-hours` | minutes | "54 days, 11 hours" |
 * | `count` | a number | "586" |
 * | `decimal` | a number | "6.8" |
 * | `days` | a number of days | "23 days" |
 * | `times` | times over | "watched twice" |
 * | `share` | 0-1 | "34%", "under 1%" |
 * | `change` | a ratio | "+18%" |
 * | `percentile` | the "Top N%" figure | "Top 3%" |
 * | `rank` | a rank | "#1" |
 * | `date` | `YYYY-MM-DD` | "July 4" |
 * | `month` | 1-12 | "November" |
 * | `year` | a year | "2023" |
 * | `hour` | 0-23 | "10 PM" |
 * | `time` | minutes after midnight | "2:47 AM" |
 * | `weekday` | 0-6, 0 is Sunday | "Sunday" |
 * | `title`, `name`, `text`, `id` | a string | as given |
 */
export const FACT_UNITS = [
  "hours", "duration", "days-hours", "count", "decimal", "days", "times", "share", "change",
  "percentile", "rank", "date", "month", "year", "hour", "time", "weekday", "title", "name", "text", "id",
] as const

export type FactUnit = (typeof FACT_UNITS)[number]

export type FactValue = number | string | null

const NBSP = "\u00A0"
const TIMES = ["", "once", "twice"]
const NUMBER_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]

const utc = (ms: number, locale: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(ms).replace(/[ \u202F]/g, NBSP)

/**
 * @example
 * ```ts
 * display("hours", 1307, { locale: "en-US" })           // "1,307"
 * display("days-hours", 78420, { locale: "en-US" })     // "54\u00A0days, 11\u00A0hours"
 * display("hour", 22, { locale: "en-US" })              // "10\u00A0PM"
 * display("change", 0.18, { locale: "en-US" })          // "+18%"
 * display("times", 3, { locale: "en-US" })              // "watched three times"
 * ```
 */
export function display(unit: FactUnit, value: FactValue, settings: { locale: string }): string {
  if (value === null) return ""
  if (typeof value === "string") {
    if (unit === "date") return formatDayMonth(value, settings)
    return value
  }
  const { locale } = settings
  switch (unit) {
    case "hours":
      return formatHero(value, settings)
    case "duration":
      return formatRewindDuration(value, settings)
    case "days-hours":
      return formatDuration(value, "long", { largestUnit: "day", smallestUnit: "hour", maxUnits: 2, locale }).replace(
        /(\d) /g,
        `$1${NBSP}`
      )
    case "count":
    case "rank":
      return `${unit === "rank" ? "#" : ""}${formatNumber(value, settings)}`
    case "decimal":
      return formatNumber(value, settings, { maximumFractionDigits: 1 })
    case "days":
      return formatCount(value, { one: "day", other: "days" }, settings)
    case "times":
      return `watched ${TIMES[value] ?? `${NUMBER_WORDS[value] ?? formatNumber(value, settings)} times`}`
    case "share":
      return formatShare(value, settings)
    case "change":
      return `${value >= 0 ? "+" : "\u2212"}${formatShare(Math.abs(value), settings)}`
    case "percentile":
      return `Top ${formatNumber(value, settings)}%`
    case "month":
      return utc(Date.UTC(2026, value - 1, 1), locale, { month: "long" })
    case "year":
      return formatNumber(value, settings, { useGrouping: false })
    case "hour":
      return formatHour(value, settings)
    case "time":
      return utc(Date.UTC(2026, 0, 1, 0, value), locale, { hour: "numeric", minute: "2-digit" })
    case "weekday":
      return utc(Date.UTC(2026, 0, 4 + value), locale, { weekday: "long" })
    default:
      return String(value)
  }
}
