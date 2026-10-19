/**
 * Wall-clock arithmetic in an IANA time zone, from `Intl` alone.
 *
 * Pure and safe to import on the client. Nothing here reads the process zone
 * (`Date#getHours()`, `new Date("2026-12-31T23:59")`), so results are the
 * same whatever `TZ` the server or browser runs under.
 *
 * ## Wall time to instant
 *
 * `wallTimeToInstant` reads the zone's offset a day before and a day after
 * the wall time, tries both, and keeps the candidate whose wall time matches:
 *
 * - no transition nearby: both offsets agree, one candidate;
 * - autumn (an hour that happens twice): both match, the earlier instant wins;
 * - spring (an hour that never happens): neither matches, and the time moves
 *   forward by the gap, so 02:30 on 8 March 2026 in Los Angeles is 03:30 PDT.
 *
 * @module lib/utils/zoned-time
 */

/** Wall-clock parts of an instant in one zone. `weekday` is 0 for Sunday. */
export interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  weekday: number
}

const DAY_MS = 86_400_000
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

// A server pass formats about 100,000 instants, so each zone builds one formatter.
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(zone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(zone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    })
    formatters.set(zone, formatter)
  }
  return formatter
}

/**
 * The wall-clock parts of `ms` in `zone`.
 *
 * @example
 * ```ts
 * zonedParts(Date.parse("2026-03-11T05:00:00Z"), "America/Los_Angeles")
 * // { year: 2026, month: 3, day: 10, hour: 22, minute: 0, second: 0, weekday: 2 }
 * ```
 */
export function zonedParts(ms: number, zone: string): ZonedParts {
  const parts: ZonedParts = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0, weekday: 0 }
  for (const { type, value } of formatterFor(zone).formatToParts(ms)) {
    if (type === "weekday") parts.weekday = WEEKDAYS[value]
    else if (type in parts) parts[type as keyof ZonedParts] = Number(value)
  }
  return parts
}

const pad = (value: number, width = 2) => String(value).padStart(width, "0")

/** `YYYY-MM-DD` of a calendar date given as parts. */
export function formatDayKey(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`
}

/**
 * The calendar day of `ms` in `zone`, as `YYYY-MM-DD`.
 *
 * @example
 * ```ts
 * dayKey(Date.parse("2026-12-31T23:30:00Z"), "Europe/Berlin") // "2027-01-01"
 * ```
 */
export function dayKey(ms: number, zone: string): string {
  const { year, month, day } = zonedParts(ms, zone)
  return formatDayKey(year, month, day)
}

/** The zone's offset from UTC at `ms`, in milliseconds (positive east of Greenwich). */
function offsetAt(ms: number, zone: string): number {
  const p = zonedParts(ms, zone)
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return wall - (ms - (((ms % 1000) + 1000) % 1000))
}

/** Whether `value` is a real `YYYY-MM-DDTHH:mm` wall time (`2026-02-30T10:00` is not). */
export function isWallTime(value: string): boolean {
  const match = WALL_TIME.exec(value)
  if (!match) return false
  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    hour < 24 &&
    minute < 60
  )
}

/**
 * The instant at which `zone`'s clocks read `wallTime` (`YYYY-MM-DDTHH:mm`).
 * See the module notes for the spring gap and the repeated autumn hour.
 *
 * @throws RangeError when `wallTime` is not a real wall time.
 *
 * @example
 * ```ts
 * wallTimeToInstant("2026-12-31T23:59", "America/Los_Angeles").toISOString()
 * // "2027-01-01T07:59:00.000Z"
 * ```
 */
export function wallTimeToInstant(wallTime: string, zone: string): Date {
  if (!isWallTime(wallTime)) throw new RangeError(`Not a wall time: ${wallTime}`)
  const [year, month, day, hour, minute] = WALL_TIME.exec(wallTime)!.slice(1).map(Number)
  const local = Date.UTC(year, month - 1, day, hour, minute)

  const before = offsetAt(local - DAY_MS, zone)
  const after = offsetAt(local + DAY_MS, zone)
  const earlier = local - Math.max(before, after)
  const later = local - Math.min(before, after)
  const matches = [earlier, later].filter((candidate) => candidate + offsetAt(candidate, zone) === local)

  // In the spring gap neither matches; the pre-transition offset moves it forward.
  return new Date(matches.length > 0 ? matches[0] : local - before)
}

/**
 * The wall time of an instant in `zone`, as `YYYY-MM-DDTHH:mm` (the value a
 * `datetime-local` input takes).
 *
 * @example
 * ```ts
 * instantToWallTime(new Date("2027-01-01T05:59:00Z"), "America/Chicago") // "2026-12-31T23:59"
 * ```
 */
export function instantToWallTime(instant: Date | number, zone: string): string {
  const p = zonedParts(typeof instant === "number" ? instant : instant.getTime(), zone)
  return `${formatDayKey(p.year, p.month, p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

let options: string[] | null = null

/**
 * ICU still names these zones by their old CLDR ids (`Asia/Saigon`,
 * `Europe/Kiev`), so `Intl` hands them back for the current IANA names. The
 * zone a member picks is the one Rewind prints in `tz.label` (design 7.7),
 * so the options and the normalised value use the IANA name. Only renames of
 * the same place are listed, never zones that IANA merged into another.
 */
const IANA_RENAMES: Readonly<Record<string, string>> = {
  "Africa/Asmera": "Africa/Asmara",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Catamarca": "America/Argentina/Catamarca",
  "America/Cordoba": "America/Argentina/Cordoba",
  "America/Godthab": "America/Nuuk",
  "America/Indianapolis": "America/Indiana/Indianapolis",
  "America/Jujuy": "America/Argentina/Jujuy",
  "America/Louisville": "America/Kentucky/Louisville",
  "America/Mendoza": "America/Argentina/Mendoza",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Europe/Kiev": "Europe/Kyiv",
  "Pacific/Enderbury": "Pacific/Kanton",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
}

const ianaName = (zone: string) => IANA_RENAMES[zone] ?? zone

/**
 * Every zone the settings can store: `UTC` first, then
 * `Intl.supportedValuesOf('timeZone')` (which on Node 22 leaves `UTC` out)
 * under their current IANA names.
 */
export function timeZoneOptions(): string[] {
  options ??= ["UTC", ...Intl.supportedValuesOf("timeZone").map(ianaName).sort()]
  return options
}

/**
 * The canonical IANA name for `input`, or null when it is not a zone the
 * settings can store. Aliases resolve (`US/Pacific` is `America/Los_Angeles`,
 * `Etc/UTC` is `UTC`, `Asia/Saigon` is `Asia/Ho_Chi_Minh`); offsets such as
 * `+05:00` and unknown names are null.
 *
 * @example
 * ```ts
 * normalizeTimeZone("US/Pacific") // "America/Los_Angeles"
 * normalizeTimeZone("Mars/Base")  // null
 * ```
 */
export function normalizeTimeZone(input: string | null | undefined): string | null {
  if (!input) return null
  try {
    const zone = ianaName(new Intl.DateTimeFormat("en-US", { timeZone: input }).resolvedOptions().timeZone)
    return timeZoneOptions().includes(zone) ? zone : null
  } catch {
    return null
  }
}
