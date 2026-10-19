/**
 * Rewind's number rules, on top of the app formatter `lib/utils/format.ts`
 * (design 4.9 and 5.4 item 7). Only what Rewind adds lives here:
 *
 * - U+00A0 between a number and its unit or meridiem ("10 PM", "26 h 10 m",
 *   "4 July"), so a line can never end on "3" and start on "AM";
 * - plurals through `Intl.PluralRules`, so nothing reads "1 films";
 * - "under 1%" for shares too small to round to a whole percent;
 * - hero numbers never abbreviated: "12,480", not "12.5K";
 * - durations through the shared, floored `formatDuration`.
 *
 * Pure and client-safe, like the module it extends.
 *
 * @example
 * ```ts
 * formatHero(12480, { locale: "en-US" })                               // "12,480"
 * formatCount(1, { one: "film", other: "films" }, { locale: "en-GB" })  // "1\u00A0film"
 * formatRewindDuration(1570, { locale: "en-US" })                      // "26\u00A0h 10\u00A0m"
 * formatRewindDuration(7, { locale: "en-US" })                         // "7\u00A0minutes"
 * formatShare(0.004, { locale: "en-US" })                              // "under 1%"
 * formatHour(22, { locale: "en-US" })                                  // "10\u00A0PM"
 * formatDayMonth("2026-07-04", { locale: "en-GB" })                    // "4\u00A0July"
 * ```
 *
 * @module lib/rewind/format
 */

import { formatDayKey, formatDuration, formatNumber, formatPercent, type FormatSettings } from "@/lib/utils/format"

type Locale = Pick<FormatSettings, "locale">

const NBSP = "\u00A0"
const pluralRules = new Map<string, Intl.PluralRules>()
const hourFormats = new Map<string, Intl.DateTimeFormat>()

/** Every space and narrow no-break space becomes U+00A0. */
const unbreakable = (text: string) => text.replace(/[ \u202F]/g, NBSP)

/** A hero number in full: "12,480", never "12.5K". */
export function formatHero(n: number, settings: Locale): string {
  return formatNumber(n, settings, { maximumFractionDigits: 0 })
}

/** "1 film", "2 films", "12,480 hours", with the plural form `Intl.PluralRules` picks. */
export function formatCount(n: number, forms: { one: string; other: string }, { locale }: Locale): string {
  let rules = pluralRules.get(locale)
  if (!rules) {
    rules = new Intl.PluralRules(locale)
    pluralRules.set(locale, rules)
  }
  const word = rules.select(n) === "one" ? forms.one : forms.other
  return `${formatNumber(n, { locale })}${NBSP}${word}`
}

/**
 * A watch time, floored: "47 minutes" under an hour, otherwise "26 h 10 m".
 * Each number is tied to its unit with U+00A0.
 */
export function formatRewindDuration(minutes: number, { locale }: Locale): string {
  if (minutes < 60) return formatCount(Math.max(0, Math.floor(minutes)), { one: "minute", other: "minutes" }, { locale })
  return formatDuration(minutes, "short", { largestUnit: "hour", locale }).replace(/(\d) /g, `$1${NBSP}`)
}

/** A share of the year: "34%", and "under 1%" for anything above 0 and under 1%. */
export function formatShare(ratio: number, settings: Locale): string {
  if (ratio > 0 && ratio < 0.01) return `under 1%`
  return formatPercent(ratio, settings, 0)
}

/**
 * An hour bucket (0-23, already in the member's zone) as a time of day:
 * "10 PM" in en-US, "22:00" in a 24-hour locale.
 */
export function formatHour(hour: number, { locale }: Locale): string {
  let format = hourFormats.get(locale)
  if (!format) {
    const twelve = new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone: "UTC" })
    const h12 = twelve.resolvedOptions().hourCycle?.startsWith("h1") ?? false
    format = h12 ? twelve : new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })
    hourFormats.set(locale, format)
  }
  return unbreakable(format.format(Date.UTC(2026, 0, 1, hour)))
}

/** A `YYYY-MM-DD` day as "4 July" (en-GB) or "July 4" (en-US), never split. */
export function formatDayMonth(key: string, settings: Locale): string {
  return unbreakable(formatDayKey(key, "day-month", settings))
}
