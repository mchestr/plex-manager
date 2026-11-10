/**
 * Overseerr requests on snapshot items (TS 7.6 Requests, 4.3). Pure and
 * client-safe.
 *
 * 1. Invert the user index (O1): Overseerr user id to plex.tv id
 *    (`String(plexId)`).
 * 2. Drop a repeated request `id` and every DECLINED request (`status` 3,
 *    Seerr `server/constants/media.ts`).
 * 3. `by` is the plex.tv id of `requestedBy.id`, or null.
 * 4. Movies attach to the movie item whose `ids.tmdb` equals `media.tmdbId`.
 *    TV attaches to the show item by `tvdbId`, else by `tmdbId` (a show whose
 *    TVDB id differs from the request's never takes it). `seasons` holds the
 *    season numbers of a TV request.
 * 5. A season item gets its show's requests whose `seasons` include its
 *    number, or are null.
 *
 * A `createdAt` that does not parse takes the read's start as `at`: such a
 * request then reads as new, which protects more and deletes less.
 *
 * @module lib/cleanup/snapshot/requests
 */

import { epochOf } from "@/lib/cleanup/identity/copies"
import type { RequestFact, SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { SeerrRequest } from "@/lib/cleanup/schema/upstream"

/** Seerr `MediaRequestStatus.DECLINED`. */
export const DECLINED_STATUS = 3

/** A request kept between `addRequests` and `finish`: its ids and its fact without the requester. */
export interface PendingRequest {
  type: "movie" | "tv"
  tmdb: number | null
  tvdb: number | null
  requester: number | null
  at: number | null
  fact: Omit<RequestFact, "at" | "by">
}

export interface RequestLog {
  add(rows: readonly SeerrRequest[]): void
  pending(): readonly PendingRequest[]
}

const positiveInt = (value: number | null | undefined) => (value !== null && value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : null)

/** The requests of a read, with repeated ids and declined requests left out. */
export function createRequestLog(): RequestLog {
  const seen = new Set<number>()
  const list: PendingRequest[] = []
  return {
    add(rows) {
      for (const row of rows) {
        if (seen.has(row.id)) continue
        seen.add(row.id)
        if (row.status === DECLINED_STATUS) continue
        const seasons = row.type === "tv" && row.seasons ? row.seasons.map((s) => s.seasonNumber).filter((n) => Number.isInteger(n) && n >= 0) : null
        list.push({
          type: row.type, tmdb: positiveInt(row.media.tmdbId), tvdb: positiveInt(row.media.tvdbId), requester: row.requestedBy?.id ?? null,
          at: epochOf(row.createdAt), fact: { status: Math.trunc(row.status), is4k: row.is4k ?? false, seasons },
        })
      }
    },
    pending: () => list,
  }
}

/** O1 inverted: Overseerr user id to plex.tv id. `index` maps plex.tv id to Overseerr user id (`buildOverseerrUserIndex`). */
export function invertUserIndex(index: ReadonlyMap<number, number>): Map<number, string> {
  const out = new Map<number, string>()
  for (const [plexId, overseerrId] of index) if (Number.isSafeInteger(plexId) && plexId >= 0) out.set(overseerrId, String(plexId))
  return out
}

export interface RequestIndex {
  /** The requests of one item, oldest first. */
  forItem(item: SnapshotItem): RequestFact[]
  /** Every plex.tv id that made a request that was not declined. */
  requesters: Set<string>
}

function push<K>(map: Map<K, RequestFact[]>, key: K, fact: RequestFact): void {
  const list = map.get(key)
  if (list) list.push(fact)
  else map.set(key, [fact])
}

/**
 * Attach the pending requests to the movie and show items (TS 7.6 Requests).
 *
 * @param users - `invertUserIndex()` of O1.
 * @param fallbackAt - Unix seconds for a request whose `createdAt` does not parse: the read's start.
 * @param shows - The show items, for TV requests.
 */
export function indexRequests(pending: readonly PendingRequest[], users: ReadonlyMap<number, string>, fallbackAt: number,
  shows: readonly SnapshotItem[]): RequestIndex {
  const byTvdb = new Map<number, SnapshotItem[]>()
  const byTmdb = new Map<number, SnapshotItem[]>()
  for (const show of shows) {
    if (show.ids.tvdb !== undefined) byTvdb.set(show.ids.tvdb, [...(byTvdb.get(show.ids.tvdb) ?? []), show])
    if (show.ids.tmdb !== undefined) byTmdb.set(show.ids.tmdb, [...(byTmdb.get(show.ids.tmdb) ?? []), show])
  }
  const movies = new Map<number, RequestFact[]>()
  const showRequests = new Map<string, RequestFact[]>()
  const requesters = new Set<string>()
  for (const request of pending) {
    const by = request.requester === null ? null : (users.get(request.requester) ?? null)
    if (by !== null) requesters.add(by)
    const fact: RequestFact = { at: request.at ?? fallbackAt, by, ...request.fact }
    if (request.type === "movie") {
      if (request.tmdb !== null) push(movies, request.tmdb, fact)
      continue
    }
    const tvdbShows = request.tvdb === null ? [] : (byTvdb.get(request.tvdb) ?? [])
    const targets = tvdbShows.length > 0 || request.tmdb === null ? tvdbShows
      : (byTmdb.get(request.tmdb) ?? []).filter((show) => request.tvdb === null || show.ids.tvdb === undefined)
    for (const show of targets) push(showRequests, show.key, fact)
  }
  const sorted = (facts: readonly RequestFact[] | undefined) => [...(facts ?? [])].sort((a, b) => a.at - b.at)
  return {
    forItem(item) {
      if (item.level === "movie") return item.ids.tmdb === undefined ? [] : sorted(movies.get(item.ids.tmdb))
      if (item.level === "show") return sorted(showRequests.get(item.key))
      const n = item.seasonNumber
      return sorted(showRequests.get(item.showKey ?? "")).filter((r) => r.seasons === null || (n !== null && r.seasons.includes(n)))
    },
    requesters,
  }
}
