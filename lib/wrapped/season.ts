/**
 * The Rewind season: when generation is open and which year is "the" year,
 * one rule for the dashboard card (through `getWrappedSettings()`), the
 * `/rewind` resolver and the admin screens (RWP-04, RWV-02, UI-02, GAP-40).
 *
 * The module imports `server-only`. The package is installed, but its default
 * export throws outside the `react-server` condition (Next resolves it for
 * server code, and next/jest maps it to an empty module), so tsx scripts
 * (`scripts/`, the Prisma seed) must not import this module.
 *
 * ## Rule
 *
 * The season opens at 00:00 on `Config.rewindSeasonOpens` and closes at the
 * end of `Config.rewindSeasonCloses` (month-day values, `12-01` and `01-31`
 * by default), both in the server zone (`serverZone()`).
 *
 * - A window that crosses the new year (opens after it closes in the
 *   calendar) belongs to the year it opens in: up to the close day the season
 *   year is last year, so on 2 January 2027 it is 2026; after it, this year.
 * - A window within one year belongs to the calendar year.
 * - Outside the window the season year is the coming season's year, so on
 *   18 October 2026 the season is 2026, not yet open.
 * - `02-29` falls on 28 February in a common year.
 *
 * @module lib/wrapped/season
 */

import "server-only"

import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { serverZone } from "@/lib/utils/server-zone"
import { formatDayKey, wallTimeToInstant, zonedParts } from "@/lib/utils/zoned-time"
import { YEAR_MAX, YEAR_MIN } from "@/lib/validations/shared-schemas"

const logger = createLogger("REWIND_SEASON")

/** The schema defaults of `Config.rewindSeasonOpens` and `rewindSeasonCloses`. */
export const DEFAULT_SEASON = { opens: "12-01", closes: "01-31" } as const

/** Days in each month, with 29 for February, for validating a month-day. */
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/**
 * `{ month, day }` for a `MM-DD` value that exists in some year, else null.
 *
 * @example
 * ```ts
 * parseMonthDay("12-01") // { month: 12, day: 1 }
 * parseMonthDay("02-29") // { month: 2, day: 29 }
 * parseMonthDay("02-30") // null
 * ```
 */
export function parseMonthDay(value: string): { month: number; day: number } | null {
  const match = /^(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const month = Number(match[1])
  const day = Number(match[2])
  if (month < 1 || month > 12 || day < 1 || day > MONTH_DAYS[month - 1]) return null
  return { month, day }
}

/** The season at one instant. `closesAt` is exclusive: 00:00 after the close day. */
export interface SeasonState {
  seasonYear: number
  isOpen: boolean
  opensAt: Date
  closesAt: Date
}

/** 00:00 in `zone` on `md` of `year`, or on the day after it with `nextDay`. */
function startOfMonthDay(year: number, md: { month: number; day: number }, zone: string, nextDay = false): Date {
  const lastDay = new Date(Date.UTC(year, md.month, 0)).getUTCDate()
  const date = new Date(Date.UTC(year, md.month - 1, Math.min(md.day, lastDay) + (nextDay ? 1 : 0)))
  const key = formatDayKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
  return wallTimeToInstant(`${key}T00:00`, zone)
}

/**
 * The season at `now` for a stored window, evaluated in `zone` (see the
 * module rule). Invalid stored values fall back to the defaults.
 *
 * @example
 * ```ts
 * seasonStateAt(new Date("2027-01-02T12:00:00Z"), "12-01", "01-31", "UTC")
 * // { seasonYear: 2026, isOpen: true, opensAt: 2026-12-01T00:00Z, closesAt: 2027-02-01T00:00Z }
 * seasonStateAt(new Date("2026-10-18T12:00:00Z"), "12-01", "01-31", "UTC").isOpen // false
 * ```
 */
export function seasonStateAt(now: Date, opens: string, closes: string, zone: string): SeasonState {
  let opensMd = parseMonthDay(opens)
  let closesMd = parseMonthDay(closes)
  if (!opensMd || !closesMd) {
    logger.warn("Invalid stored season dates; using the defaults", { opens, closes })
    opensMd = parseMonthDay(DEFAULT_SEASON.opens)!
    closesMd = parseMonthDay(DEFAULT_SEASON.closes)!
  }

  const today = zonedParts(now.getTime(), zone)
  const crossesYear = opensMd.month * 100 + opensMd.day > closesMd.month * 100 + closesMd.day
  const beforeClose = today.month * 100 + today.day <= closesMd.month * 100 + closesMd.day
  const seasonYear = crossesYear && beforeClose ? today.year - 1 : today.year

  const opensAt = startOfMonthDay(seasonYear, opensMd, zone)
  const closesAt = startOfMonthDay(crossesYear ? seasonYear + 1 : seasonYear, closesMd, zone, true)
  const isOpen = now.getTime() >= opensAt.getTime() && now.getTime() < closesAt.getTime()
  return { seasonYear, isOpen, opensAt, closesAt }
}

/** The season at `now` from the stored window, in the server zone. */
export async function getSeasonState(now: Date = new Date()): Promise<SeasonState> {
  const [config, zone] = await Promise.all([
    prisma.config.findUnique({
      where: { id: "config" },
      select: { rewindSeasonOpens: true, rewindSeasonCloses: true },
    }),
    serverZone(),
  ])
  return seasonStateAt(
    now,
    config?.rewindSeasonOpens ?? DEFAULT_SEASON.opens,
    config?.rewindSeasonCloses ?? DEFAULT_SEASON.closes,
    zone,
  )
}

/**
 * Completed rows in the range `/rewind/<year>` accepts: a playground save
 * for 2005 or 9999 would otherwise send the member to a 404.
 */
const OPENABLE_YEARS = { gte: YEAR_MIN, lte: YEAR_MAX }

/** The season year (see the module rule). */
export async function getSeasonYear(now: Date = new Date()): Promise<number> {
  return (await getSeasonState(now)).seasonYear
}

/**
 * The member's most recent year with a completed Rewind, or null.
 *
 * @internal
 */
export async function getLatestCompletedRewindYear(userId: string): Promise<number | null> {
  const latest = await prisma.plexWrapped.findFirst({
    where: { userId, status: "completed", year: OPENABLE_YEARS },
    orderBy: { year: "desc" },
    select: { year: true },
  })
  return latest?.year ?? null
}

/** Every year in which the member has a completed Rewind, newest first. */
export async function listCompletedRewindYears(userId: string): Promise<number[]> {
  const rows = await prisma.plexWrapped.findMany({
    where: { userId, status: "completed", year: OPENABLE_YEARS },
    orderBy: { year: "desc" },
    select: { year: true },
  })
  return rows.map((row) => row.year)
}

/**
 * The year `/rewind` opens for a member:
 *
 * 1. the season year when the member has a row for it in any state, so a
 *    generating or failed Rewind still shows its progress or failure;
 * 2. else the latest completed year;
 * 3. else the season year.
 */
export async function resolveRewindYear(userId: string, now: Date = new Date()): Promise<number> {
  const seasonYear = await getSeasonYear(now)
  const seasonRow = await prisma.plexWrapped.findUnique({
    where: { userId_year: { userId, year: seasonYear } },
    select: { id: true },
  })
  if (seasonRow) return seasonYear
  return (await getLatestCompletedRewindYear(userId)) ?? seasonYear
}
