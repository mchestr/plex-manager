/**
 * Which Rewind year is "the" year: one rule for the dashboard card (through
 * `getWrappedSettings()`), the `/wrapped` resolver and the admin screens
 * (RWP-04, RWV-02, UI-02).
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
    where: { userId, status: "completed" },
    orderBy: { year: "desc" },
    select: { year: true },
  })
  return latest?.year ?? null
}

/** Every year in which the member has a completed Rewind, newest first. */
export async function listCompletedRewindYears(userId: string): Promise<number[]> {
  const rows = await prisma.plexWrapped.findMany({
    where: { userId, status: "completed" },
    orderBy: { year: "desc" },
    select: { year: true },
  })
  return rows.map((row) => row.year)
}
