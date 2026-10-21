/**
 * Season premieres from Sonarr's calendar, for page 17's "Returning" part
 * (design 4.3, P7.2).
 *
 * - One call to `/api/v3/calendar?includeSeries=true` through
 *   `getSonarrCalendar()` (`serviceFetch`: a 10 s timeout that covers the
 *   body), from the generation date to 31 March of the next year.
 * - The body is parsed with {@link sonarrCalendarSchema}; a malformed body,
 *   a timeout or any other failure returns null, so the part is left out and
 *   the page never fails (NFR-3).
 * - A premiere is an episode 1 of a numbered season (specials, season 0,
 *   aside); a series keeps its earliest one in the range.
 *
 * The stats match these to the member's top series by `tvdb://` guid
 * (`lib/wrapped/stats/next-year.ts`).
 *
 * @module lib/wrapped/sources/sonarr-calendar
 */

import "server-only"

import { z } from "zod"

import { getSonarrCalendar } from "@/lib/connections/sonarr"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("REWIND_SONARR")

export interface SonarrEndpoint {
  name: string
  url: string
  apiKey: string
  publicUrl: string | null
}

/** A season's first episode on the calendar. */
export interface SeasonPremiere {
  tvdbId: number
  tmdbId: number | null
  title: string
  season: number
  /** `YYYY-MM-DD`, Sonarr's local air date. */
  airDate: string
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** @internal Exported for its test. */
export const sonarrCalendarSchema = z.array(
  z.looseObject({
    seasonNumber: z.number().int().nonnegative(),
    episodeNumber: z.number().int().nonnegative(),
    airDate: z.string().regex(DAY).optional(),
    series: z.looseObject({
      title: z.string().min(1),
      tvdbId: z.number().int().positive(),
      tmdbId: z.number().int().positive().nullish(),
    }),
  })
)

/** The calendar's range: the generation day to 31 March of the year after the issue's. */
export function returningRange(now: Date, year: number): { from: string; to: string } {
  return { from: now.toISOString().slice(0, 10), to: `${year + 1}-03-31` }
}

/**
 * The season premieres on Sonarr's calendar in `range`, or null when the call
 * or its body fails.
 *
 * @example
 * ```ts
 * const premieres = await fetchSeasonPremieres(sonarr, returningRange(new Date(), 2026))
 * premieres?.[0] // { tvdbId: 371980, tmdbId: 95396, title: "Severance", season: 3, airDate: "2027-01-16" }
 * ```
 */
export async function fetchSeasonPremieres(config: SonarrEndpoint, range: { from: string; to: string }): Promise<SeasonPremiere[] | null> {
  const result = await getSonarrCalendar({ ...config, publicUrl: config.publicUrl ?? undefined }, range.from, range.to, { includeSeries: true })
  if (!result.success) {
    logger.warn("Sonarr calendar failed; Next year's returning part is left out")
    return null
  }
  const parsed = sonarrCalendarSchema.safeParse(result.data)
  if (!parsed.success) {
    logger.warn("Sonarr calendar did not match the expected shape; Next year's returning part is left out", {
      issues: parsed.error.issues.slice(0, 5).map((issue) => issue.path.join(".")),
    })
    return null
  }

  const first = new Map<number, SeasonPremiere>()
  for (const episode of parsed.data) {
    const { airDate, series } = episode
    if (episode.episodeNumber !== 1 || episode.seasonNumber < 1 || !airDate || airDate < range.from || airDate > range.to) continue
    const current = first.get(series.tvdbId)
    if (current && current.airDate <= airDate) continue
    first.set(series.tvdbId, { tvdbId: series.tvdbId, tmdbId: series.tmdbId ?? null, title: series.title, season: episode.seasonNumber, airDate })
  }
  return [...first.values()].sort((a, b) => (a.airDate < b.airDate ? -1 : a.airDate > b.airDate ? 1 : a.tvdbId - b.tvdbId))
}
