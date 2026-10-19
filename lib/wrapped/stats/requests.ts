/**
 * The requests page's facts (page 14, RWP-06): what the member asked the
 * server for, and whether they watched it.
 *
 * ## Status mapping (design 7.2)
 *
 * Statuses come mapped by `toRequestEvent`: approved is 2 or 5; available is
 * an approved request whose media is 5, or 4 (partially available) for TV;
 * pending is 1; declined is 3, counted but never headlined.
 *
 * ## Watched
 *
 * A request is watched when one of the member's counted plays in the window
 * is its title, matched through the cache's guids, never the history row's
 * own `guid` (`plex://` on modern agents):
 *
 * - a film by `tmdb://<tmdbId>` on the film's `rating_key`;
 * - a series by `tvdb://<tvdbId>` or `tmdb://<tmdbId>` on its
 *   `grandparent_rating_key`, so any episode of it counts.
 *
 * Without Overseerr (`requests` null) or with no requests, the page is
 * ineligible.
 *
 * @module lib/wrapped/stats/requests
 */

import type { RequestEvent } from "@/lib/wrapped/sources/request-event"
import { isCountedPlay, type PlayEvent } from "@/lib/wrapped/sources/watch-history-source"

import { videoEvents } from "./keys"
import type { MetadataLookup } from "./metadata"

const TOP_GENRES = 3

export type RequestStats =
  | { eligible: false }
  | {
      eligible: true
      made: number
      approved: number
      available: number
      pending: number
      declined: number
      watched: number
      /** The top three request genres by count; the name breaks a tie. */
      genres: Array<{ name: string; requests: number }>
    }

/** The `tmdb://` and `tvdb://` guids of the films and series the member watched. */
function watchedGuids(events: readonly PlayEvent[], lookup: MetadataLookup): { film: Set<string>; series: Set<string> } {
  const film = new Set<string>()
  const series = new Set<string>()
  for (const e of videoEvents(events).filter(isCountedPlay)) {
    const into = e.mediaType === "movie" ? film : series
    for (const guid of lookup(e)?.guids ?? []) if (/^(tmdb|tvdb):\/\//.test(guid)) into.add(guid)
  }
  return { film, series }
}

function isWatched(request: RequestEvent, guids: ReturnType<typeof watchedGuids>): boolean {
  if (request.mediaType === "movie") return request.tmdbId !== null && guids.film.has(`tmdb://${request.tmdbId}`)
  return (
    (request.tvdbId !== null && guids.series.has(`tvdb://${request.tvdbId}`)) ||
    (request.tmdbId !== null && guids.series.has(`tmdb://${request.tmdbId}`))
  )
}

/**
 * @param requests - The member's requests created in the window, or null without Overseerr.
 *
 * @example
 * ```ts
 * const requests = computeRequests(events, memberRequests, lookup)
 * if (requests.eligible) `You asked for ${requests.made}. You watched ${requests.watched} of them.`
 * ```
 */
export function computeRequests(
  events: readonly PlayEvent[],
  requests: readonly RequestEvent[] | null,
  lookup: MetadataLookup
): RequestStats {
  if (!requests || requests.length === 0) return { eligible: false }
  const guids = watchedGuids(events, lookup)
  const genres = new Map<string, number>()
  for (const r of requests) for (const name of new Set(r.genres)) genres.set(name, (genres.get(name) ?? 0) + 1)

  return {
    eligible: true,
    made: requests.length,
    approved: requests.filter((r) => r.approved).length,
    available: requests.filter((r) => r.available).length,
    pending: requests.filter((r) => r.status === "pending").length,
    declined: requests.filter((r) => r.status === "declined").length,
    watched: requests.filter((r) => isWatched(r, guids)).length,
    genres: [...genres]
      .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1))
      .slice(0, TOP_GENRES)
      .map(([name, count]) => ({ name, requests: count })),
  }
}
