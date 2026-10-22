/**
 * The next-year page's facts (page 17): unfinished series and three picks.
 *
 * ## Left for later
 *
 * A listed series the member watched in the window's last 120 days, then
 * left for 30 days or more (to the window's end) short of its final episode.
 * The final episode is the last of the highest numbered season in the
 * cache's season episode counts (specials, season 0, aside); a series without
 * counts, or without a numbered episode played, is skipped. The furthest
 * episode is the highest season, then episode, played.
 *
 * ## Picks
 *
 * Library titles the member never played and did not hide that carry their
 * top genre (`taste.genres[0]`). Each scores one point per top actor or
 * director in its credits and per other top genre it carries; ties go to the
 * most recently added, then the title and rating key. With content-rating exclusions
 * configured, a title whose rating is excluded or unknown is never picked
 * (FR-44). Without Taste, or without the library, there are no picks.
 *
 * ## Returning
 *
 * The member's top five listed series matched by their cached `tvdb://`
 * guid to Sonarr's season premieres (`sources/sonarr-calendar.ts`), soonest
 * first, at most three. Null without Sonarr, or when its calendar failed.
 *
 * @module lib/wrapped/stats/next-year
 */

import type { LibraryItem } from "@/lib/wrapped/sources/plex-library"
import type { SeasonPremiere } from "@/lib/wrapped/sources/sonarr-calendar"
import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"
import { dayKey } from "@/lib/wrapped/time/zone"

import { isListed, videoEvents, type StatsContext, type TitleKey } from "./keys"
import type { MetadataLookup } from "./metadata"
import type { PeopleStats } from "./people"
import { rankTitles } from "./rank"
import type { TasteStats } from "./taste"

const DAY_MS = 24 * 60 * 60 * 1000
const RECENT_DAYS = 120
const LEFT_DAYS = 30
const LIMIT = 3
const TOP_SERIES = 5

export type LibraryTitle = Pick<
  LibraryItem,
  "ratingKey" | "type" | "title" | "year" | "addedAt" | "contentRating" | "genres" | "directors" | "actors"
>

export interface NextYearInput {
  taste: TasteStats
  people: PeopleStats
  /** The server's films and series, or null when the library pass is missing. */
  library: readonly LibraryTitle[] | null
  excludedContentRatings: readonly string[]
  /** Sonarr's season premieres, or null without Sonarr. */
  premieres?: readonly SeasonPremiere[] | null
}

export interface NextYearStats {
  eligible: boolean
  leftForLater: Array<{ key: TitleKey; title: string; season: number; episode: number; lastWatched: string }>
  picks: Array<{ ratingKey: string; kind: "film" | "series"; title: string; year: number | null; genre: string; person: string | null }>
  returning: Array<{ key: TitleKey; title: string; season: number; date: string; tmdbId: number | null }> | null
}

function leftForLater(events: readonly PlayEvent[], ctx: StatsContext, lookup: MetadataLookup): NextYearStats["leftForLater"] {
  const end = ctx.window.end
  const episodes = videoEvents(events).filter((e) => e.mediaType === "episode" && isListed(e, ctx))
  return rankTitles(episodes, ctx, "series").flatMap((series) => {
    const plays = episodes.filter((e) => `series:${e.grandparentRatingKey}` === series.key)
    const last = series.lastWatched
    if (last < end - RECENT_DAYS * DAY_MS || end - last < LEFT_DAYS * DAY_MS) return []
    const counts = plays.map((e) => lookup(e)?.seasonEpisodeCounts).find(Boolean)
    const finalSeason = Math.max(0, ...Object.entries(counts ?? {}).filter(([, n]) => n > 0).map(([s]) => Number(s)))
    if (!counts || finalSeason < 1) return []
    const [season, episode] = plays
      .filter((e) => (e.parentMediaIndex ?? 0) > 0 && e.mediaIndex !== null)
      .map((e) => [e.parentMediaIndex!, e.mediaIndex!] as const)
      .reduce<readonly [number, number]>((a, b) => (b[0] > a[0] || (b[0] === a[0] && b[1] > a[1]) ? b : a), [0, 0])
    if (season === 0 || season > finalSeason || (season === finalSeason && episode >= counts[String(finalSeason)])) return []
    return [{ key: series.key, title: series.title, season, episode, lastWatched: dayKey(last, ctx.zone) }]
  })
}

function returning(events: readonly PlayEvent[], ctx: StatsContext, lookup: MetadataLookup, premieres: readonly SeasonPremiere[]): NonNullable<NextYearStats["returning"]> {
  const byTvdb = new Map(premieres.map((p) => [`tvdb://${p.tvdbId}`, p]))
  const episodes = videoEvents(events).filter((e) => e.mediaType === "episode" && isListed(e, ctx))
  return rankTitles(episodes, ctx, "series")
    .slice(0, TOP_SERIES)
    .flatMap((series) => {
      const guids = episodes.filter((e) => `series:${e.grandparentRatingKey}` === series.key).flatMap((e) => lookup(e)?.guids ?? [])
      const premiere = guids.map((guid) => byTvdb.get(guid)).find(Boolean)
      return premiere ? [{ key: series.key, title: series.title, season: premiere.season, date: premiere.airDate, tmdbId: premiere.tmdbId }] : []
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, LIMIT)
}

const byText = (a: LibraryTitle, b: LibraryTitle) =>
  a.title < b.title ? -1 : a.title > b.title ? 1 : a.ratingKey < b.ratingKey ? -1 : a.ratingKey > b.ratingKey ? 1 : 0

function picks(events: readonly PlayEvent[], ctx: StatsContext, input: NextYearInput): NextYearStats["picks"] {
  const { taste, people, library } = input
  if (!taste.eligible || taste.genres.length === 0 || !library) return []
  const [genre, ...otherGenres] = taste.genres.map((g) => g.name)
  const names = people.eligible ? [...people.actors, ...people.directors].map((p) => p.name) : []
  const played = new Set(videoEvents(events).map((e) => (e.mediaType === "movie" ? e.ratingKey : e.grandparentRatingKey)))
  const excluded = new Set(input.excludedContentRatings.map((r) => r.trim().toUpperCase()))
  const allowed = (rating: string | null) => excluded.size === 0 || (rating !== null && !excluded.has(rating.trim().toUpperCase()))

  return library
    .filter((t) => (t.type === "movie" || t.type === "show") && t.genres.includes(genre))
    .filter((t) => !played.has(t.ratingKey) && !ctx.hiddenKeys.has(t.ratingKey) && allowed(t.contentRating))
    .map((t) => {
      const person = names.find((name) => t.actors.includes(name) || t.directors.includes(name)) ?? null
      const credits = names.filter((name) => t.actors.includes(name) || t.directors.includes(name)).length
      return { t, person, score: credits + otherGenres.filter((g) => t.genres.includes(g)).length }
    })
    .sort((a, b) => b.score - a.score || (b.t.addedAt ?? 0) - (a.t.addedAt ?? 0) || byText(a.t, b.t))
    .slice(0, LIMIT)
    .map(({ t, person }) => ({
      ratingKey: t.ratingKey,
      kind: t.type === "movie" ? ("film" as const) : ("series" as const),
      title: t.title,
      year: t.year,
      genre,
      person,
    }))
}

/**
 * @example
 * ```ts
 * const next = computeNextYear(events, ctx, lookup, { taste, people, library, excludedContentRatings: [] })
 * next.leftForLater[0] // { key: "series:77", title: "Severance", season: 2, episode: 6, lastWatched: "2026-09-02" }
 * ```
 */
export function computeNextYear(
  events: readonly PlayEvent[],
  ctx: StatsContext,
  lookup: MetadataLookup,
  input: NextYearInput
): NextYearStats {
  const left = leftForLater(events, ctx, lookup).slice(0, LIMIT)
  const picked = picks(events, ctx, input)
  const back = input.premieres ? returning(events, ctx, lookup, input.premieres) : null
  return { eligible: left.length > 0 || picked.length > 0 || (back?.length ?? 0) > 0, leftForLater: left, picks: picked, returning: back }
}
