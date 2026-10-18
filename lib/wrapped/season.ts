/**
 * Which Rewind year is "the" year: one rule for the dashboard card (through
 * `getWrappedSettings()`), the `/wrapped` resolver and the admin screens
 * (RWP-04, RWV-02, UI-02).
 *
 * The module imports `server-only`. The package is installed, but its default
 * export throws outside the `react-server` condition (Next resolves it for
 * server code, and next/jest maps it to an empty module), so tsx scripts
 * (`scripts/`, the Prisma seed) must not import this module.
 *
 * ## Rule
 *
 * 1. When `Config.wrappedGenerationStartDate` is set, the season year is the
 *    year of that date, so a Dec 1 - Jan 31 window saved in 2026 stays on
 *    2026 through January 2027.
 * 2. Otherwise it is the calendar year, minus one in January: the season
 *    closes on 31 January, so on 2 January 2027 the season is still 2026.
 *
 * ## Known limitation (until P2.2)
 *
 * Dates are read in the server's local zone, and a start date saved in an
 * earlier year still wins: a window saved in 2025 and never re-saved keeps
 * the season on 2025. P2.2 replaces the stored dates with month-day values
 * evaluated in `Config.timezone`.
 *
 * @module lib/wrapped/season
 */

import "server-only"

import { prisma } from "@/lib/prisma"
import { YEAR_MAX, YEAR_MIN } from "@/lib/validations/shared-schemas"

/**
 * Completed rows in the range `/wrapped/<year>` accepts: a playground save
 * for 2005 or 9999 would otherwise send the member to a 404.
 */
const OPENABLE_YEARS = { gte: YEAR_MIN, lte: YEAR_MAX }

/**
 * The season year for a configured start date (or none) at `now`.
 *
 * @example
 * ```ts
 * seasonYearFor(new Date(2026, 11, 1), new Date(2027, 0, 2)) // 2026
 * seasonYearFor(null, new Date(2027, 0, 2))                  // 2026
 * seasonYearFor(null, new Date(2026, 9, 18))                 // 2026
 * ```
 */
export function seasonYearFor(startDate: Date | null, now: Date): number {
  if (startDate) return startDate.getFullYear()
  return now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
}

/** The season year from the stored Rewind window (see the module rule). */
export async function getSeasonYear(now: Date = new Date()): Promise<number> {
  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { wrappedGenerationStartDate: true },
  })
  return seasonYearFor(config?.wrappedGenerationStartDate ?? null, now)
}

/** The member's most recent year with a completed Rewind, or null. */
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
 * The year `/wrapped` opens for a member:
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
