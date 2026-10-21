/**
 * The one formatter module: numbers, money, dates, durations and relative time.
 *
 * ## Zone and locale
 *
 * Every function that depends on a zone or a locale takes them explicitly as
 * `{ timeZone, locale }` (the app's `Config.timezone` and `Config.locale`, from
 * `getAppSettings()` on the server and `useFormat()` on the client). Nothing
 * reads the process or browser zone, so a Server Component and the client
 * component it renders print the same text, and hydration never mismatches.
 *
 * `Intl` instances are cached per locale, zone and option set: building one is
 * far slower than using one.
 *
 * ## Durations
 *
 * `formatDuration` floors every unit: 119.9 minutes is "1 h 59 m", never
 * "2 h". The v2 helpers are option sets of it:
 *
 * - `formatWatchTime(m)` is `formatDuration(m, "long", { largestUnit: "day" })`;
 * - `formatWatchTimeHours(m)` is
 *   `formatDuration(m, "long", { largestUnit: "day", smallestUnit: "hour", maxUnits: 1 })`.
 *
 * Pure and safe to import on the client. `serverZone()` lives in the
 * server-only `lib/utils/server-zone.ts`.
 *
 * @module lib/utils/format
 */

import { dayKey, zonedParts } from "@/lib/utils/zoned-time"

/** The zone and locale every formatter works in. */
export interface FormatSettings {
  timeZone: string
  locale: string
}

export type DateInput = Date | string | number

const intlCache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat | Intl.RelativeTimeFormat>()

function cached<T extends Intl.NumberFormat | Intl.DateTimeFormat | Intl.RelativeTimeFormat>(
  kind: string,
  locale: string,
  options: object,
  build: () => T,
): T {
  const key = `${kind}|${locale}|${JSON.stringify(options)}`
  let instance = intlCache.get(key) as T | undefined
  if (!instance) {
    instance = build()
    intlCache.set(key, instance)
  }
  return instance
}

const numberFormat = (locale: string, options: Intl.NumberFormatOptions = {}) =>
  cached("n", locale, options, () => new Intl.NumberFormat(locale, options))

const dateFormat = (locale: string, options: Intl.DateTimeFormatOptions) =>
  cached("d", locale, options, () => new Intl.DateTimeFormat(locale, options))

const toDate = (value: DateInput) => (value instanceof Date ? value : new Date(value))

// ---- Numbers and money -------------------------------------------------

/** "21,338" in en-US, "21.338" in de-DE. */
export function formatNumber(n: number, { locale }: Pick<FormatSettings, "locale">, options?: Intl.NumberFormatOptions): string {
  return numberFormat(locale, options).format(n)
}

/** "1.2K", "3.4M". */
export function formatCompact(n: number, { locale }: Pick<FormatSettings, "locale">): string {
  return numberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n)
}

/** A ratio (0.125) as a percentage ("12.5%"), with a fixed number of decimals. */
export function formatPercent(ratio: number, { locale }: Pick<FormatSettings, "locale">, digits = 1): string {
  return numberFormat(locale, { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(ratio)
}

/**
 * US dollars. At $1 and above, 2 decimals. Below $1, 3 decimals in tables
 * ("$0.087") and 2 significant digits in prose ("$0.50", "$0.00012").
 *
 * @example
 * ```ts
 * formatMoney(0.0874, "table", { locale: "en-US" })   // "$0.087"
 * formatMoney(0.000123, "prose", { locale: "en-US" }) // "$0.00012"
 * ```
 */
export function formatMoney(usd: number, mode: "table" | "prose", { locale }: Pick<FormatSettings, "locale">): string {
  const base = { style: "currency", currency: "USD" } as const
  // From $0.10, 2 significant digits are 2 decimals, so prose keeps cents ("$0.50").
  if (Math.abs(usd) >= (mode === "prose" ? 0.1 : 1) || usd === 0) {
    return numberFormat(locale, { ...base, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(usd)
  }
  if (mode === "table") {
    return numberFormat(locale, { ...base, minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(usd)
  }
  return numberFormat(locale, { ...base, maximumSignificantDigits: 2 }).format(usd)
}

/** "21,338 tokens". */
export function formatTokens(n: number, settings: Pick<FormatSettings, "locale">): string {
  return `${formatNumber(n, settings)} ${n === 1 ? "token" : "tokens"}`
}

// ---- Dates ---------------------------------------------------------------

/**
 * - `short`: "Oct 11, 2026" (tables)
 * - `long`: "October 11, 2026" (prose)
 * - `day-month`: "October 11" in en-US, "11 October" in en-GB (Rewind copy)
 * - `day-month-short`: "Oct 11" (chart axes)
 */
export type DateStyle = "short" | "long" | "day-month" | "day-month-short"

const DATE_STYLES: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  short: { year: "numeric", month: "short", day: "numeric" },
  long: { year: "numeric", month: "long", day: "numeric" },
  "day-month": { month: "long", day: "numeric" },
  "day-month-short": { month: "short", day: "numeric" },
}

const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" }

/** A date in the app zone. */
export function formatDate(value: DateInput, style: DateStyle, { timeZone, locale }: FormatSettings): string {
  return dateFormat(locale, { ...DATE_STYLES[style], timeZone }).format(toDate(value))
}

/** A time of day in the app zone: "2:28 PM", "14:28". */
export function formatTime(value: DateInput, { timeZone, locale }: FormatSettings): string {
  return dateFormat(locale, { ...TIME, timeZone }).format(toDate(value))
}

/**
 * "Oct 11, 2026, 2:28 PM". `zoneLabel` appends the zone ("PDT"), for
 * server-rendered admin timestamps that sit next to browser-local ones.
 */
export function formatDateTime(
  value: DateInput,
  { timeZone, locale }: FormatSettings,
  { zoneLabel = false }: { zoneLabel?: boolean } = {},
): string {
  const options: Intl.DateTimeFormatOptions = { ...DATE_STYLES.short, ...TIME, timeZone }
  if (zoneLabel) options.timeZoneName = "short"
  return dateFormat(locale, options).format(toDate(value))
}

/**
 * A date-only `YYYY-MM-DD` key, formatted from its parts. `new Date(key)` is
 * UTC midnight, which prints as the day before anywhere west of Greenwich.
 *
 * @example
 * ```ts
 * formatDayKey("2026-10-17", "short", { locale: "en-US" }) // "Oct 17, 2026"
 * ```
 */
export function formatDayKey(key: string, style: DateStyle, { locale }: Pick<FormatSettings, "locale">): string {
  const [year, month, day] = key.split("-").map(Number)
  return dateFormat(locale, { ...DATE_STYLES[style], timeZone: "UTC" }).format(Date.UTC(year, month - 1, day))
}

/**
 * Whole calendar months from `a` to `b` in `timeZone`; negative when `b` is
 * earlier. 30 April to 30 October is 6; to 29 October it is 5.
 */
export function calendarMonthsBetween(a: DateInput, b: DateInput, timeZone: string): number {
  const from = toDate(a).getTime()
  const to = toDate(b).getTime()
  if (to < from) return -calendarMonthsBetween(to, from, timeZone)
  const start = zonedParts(from, timeZone)
  const end = zonedParts(to, timeZone)
  const months = (end.year - start.year) * 12 + (end.month - start.month)
  return end.day < start.day ? months - 1 : months
}

const daysBetweenKeys = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 86_400_000

/**
 * "now", "5 minutes ago", "yesterday", "11 months ago", "in 2 hours".
 *
 * Under a day, it counts elapsed time; past that, calendar days and calendar
 * months in `timeZone`. A post from 20:00 yesterday reads "yesterday" at
 * 18:00 today, and 360 days back reads "11 months ago".
 */
export function formatRelative(value: DateInput, { now, timeZone, locale }: FormatSettings & { now: DateInput }): string {
  const rtf = cached("r", locale, {}, () => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }))
  const target = toDate(value).getTime()
  const current = toDate(now).getTime()
  const seconds = (target - current) / 1000
  const trunc = (n: number) => Math.trunc(n) || 0

  if (Math.abs(seconds) < 60) return rtf.format(Math.abs(seconds) < 10 ? 0 : trunc(seconds), "second")
  if (Math.abs(seconds) < 3600) return rtf.format(trunc(seconds / 60), "minute")

  const days = daysBetweenKeys(dayKey(current, timeZone), dayKey(target, timeZone))
  if (days === 0) return rtf.format(trunc(seconds / 3600), "hour")

  const months = calendarMonthsBetween(current, target, timeZone)
  if (Math.abs(months) >= 12) return rtf.format(trunc(months / 12), "year")
  if (months !== 0) return rtf.format(months, "month")
  return rtf.format(days, "day")
}

/**
 * Converts an end-date string to the start of the next day, for inclusive
 * range queries with `lt`.
 *
 * **UTC only.** `"2025-01-15"` parses as UTC midnight, so the bound is
 * `2025-01-16T00:00:00.000Z`. That matches Prisma's UTC timestamps and HTML
 * date inputs; a zone-aware bound would build on `wallTimeToInstant`.
 *
 * @example
 * ```ts
 * toEndOfDayExclusive("2025-01-15")?.toISOString() // "2025-01-16T00:00:00.000Z"
 * ```
 */
export function toEndOfDayExclusive(dateStr: string | undefined): Date | undefined {
  if (!dateStr) return undefined
  return new Date(new Date(dateStr).getTime() + 86_400_000)
}

// ---- Durations, sizes, resolution -------------------------------------------

type DurationUnit = "day" | "hour" | "minute" | "second"

const UNITS: { unit: DurationUnit; seconds: number; short: string; long: [string, string] }[] = [
  { unit: "day", seconds: 86_400, short: "d", long: ["day", "days"] },
  { unit: "hour", seconds: 3600, short: "h", long: ["hour", "hours"] },
  { unit: "minute", seconds: 60, short: "m", long: ["minute", "minutes"] },
  { unit: "second", seconds: 1, short: "s", long: ["second", "seconds"] },
]

export interface DurationOptions {
  largestUnit?: DurationUnit
  smallestUnit?: DurationUnit
  maxUnits?: number
  locale?: string
}

/**
 * A duration in minutes, every unit floored: "26 h 10 m" (`short`) or
 * "26 hours, 10 minutes" (`long`). Zero units are left out; an empty result
 * shows 0 of the smallest unit. `smallestUnit: "second"` suits job runs.
 *
 * @example
 * ```ts
 * formatDuration(119.9, "short")                         // "1 h 59 m"
 * formatDuration(1500, "long", { largestUnit: "day" })   // "1 day, 1 hour"
 * formatDuration(1.5, "short", { smallestUnit: "second" }) // "1 m 30 s"
 * ```
 */
export function formatDuration(
  minutes: number,
  style: "short" | "long",
  { largestUnit = "hour", smallestUnit = "minute", maxUnits = 3, locale = "en-US" }: DurationOptions = {},
): string {
  const units = UNITS.slice(
    UNITS.findIndex((u) => u.unit === largestUnit),
    UNITS.findIndex((u) => u.unit === smallestUnit) + 1,
  )
  const step = units[units.length - 1].seconds
  // Floored to the smallest unit first, so the default floors whole minutes as before.
  let rest = Math.floor((Number.isFinite(minutes) && minutes > 0 ? minutes * 60 : 0) / step) * step
  const label = (value: number, u: (typeof UNITS)[number]) =>
    style === "short"
      ? `${formatNumber(value, { locale })} ${u.short}`
      : `${formatNumber(value, { locale })} ${u.long[value === 1 ? 0 : 1]}`

  const parts: string[] = []
  for (const u of units) {
    const value = Math.floor(rest / u.seconds)
    rest -= value * u.seconds
    if (value > 0 && parts.length < maxUnits) parts.push(label(value, u))
  }
  if (parts.length === 0) return label(0, units[units.length - 1])
  return parts.join(style === "short" ? " " : ", ")
}

/** "About 4 minutes", for reading and listening times. */
export function formatApproxDuration(minutes: number): string {
  return `About ${formatDuration(Math.max(1, Math.round(minutes)), "long", { largestUnit: "hour", maxUnits: 1 })}`
}

/** File size, 1024-based: "1.5 GB", "0 Bytes", "Unknown" for null. */
export function formatBytes(bytes: bigint | number | null): string {
  if (bytes === null) return "Unknown"
  const numBytes = typeof bytes === "bigint" ? Number(bytes) : bytes
  if (numBytes === 0) return "0 Bytes"

  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"]
  const i = Math.floor(Math.log(numBytes) / Math.log(1024))
  return `${parseFloat((numBytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`
}

/** A Plex resolution: "1080" is "1080p", "4k" is "4K", anything else as given. */
export function formatResolution(value: string | number): string {
  const trimmed = String(value).trim()
  if (/^\d+$/.test(trimmed)) return `${trimmed}p`
  if (/^4k$/i.test(trimmed)) return "4K"
  return trimmed
}

// ---- Bound formatters ---------------------------------------------------------

/** Every zone- or locale-dependent formatter, bound to one `FormatSettings`. */
export function bindFormat(settings: FormatSettings) {
  return {
    settings,
    number: (n: number, options?: Intl.NumberFormatOptions) => formatNumber(n, settings, options),
    percent: (ratio: number, digits?: number) => formatPercent(ratio, settings, digits),
    money: (usd: number, mode: "table" | "prose" = "table") => formatMoney(usd, mode, settings),
    tokens: (n: number) => formatTokens(n, settings),
    date: (value: DateInput, style: DateStyle = "short") => formatDate(value, style, settings),
    time: (value: DateInput) => formatTime(value, settings),
    dateTime: (value: DateInput, options?: { zoneLabel?: boolean }) => formatDateTime(value, settings, options),
    dayKey: (key: string, style: DateStyle = "short") => formatDayKey(key, style, settings),
    relative: (value: DateInput, now: DateInput) => formatRelative(value, { ...settings, now }),
    duration: (minutes: number, style: "short" | "long", options?: Omit<DurationOptions, "locale">) =>
      formatDuration(minutes, style, { ...options, locale: settings.locale }),
  }
}

export type BoundFormat = ReturnType<typeof bindFormat>
