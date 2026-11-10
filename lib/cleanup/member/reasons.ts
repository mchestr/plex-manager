/**
 * Why a Leaving soon title is under "For you" (UX 9.2.3, TS 13.3 step 4):
 * one reason per title, the first that applies, with the date of its fact.
 * Pure and client-safe.
 *
 * | Reason | Applies when | `reasonAt` |
 * |---|---|---|
 * | `requested` | the member has an applicable request (TS 4.3 `R`) | its newest `at` |
 * | `started` | the member's counted play is not finished (movie: the newest one; show, season: not every episode) | `lastCountedAt` |
 * | `played` | the member has a counted play | `lastCountedAt` |
 * | `watchlist` | G8 is off, and the member's own synced watchlist holds the title's ids | `syncedAt` |
 *
 * Only the member's own facts count: their plex.tv id in the requests and the
 * viewer rows. A title in Leaving soon is one that no protection keeps safe,
 * so no line says that the title is safe. With G8 on, a title on a watchlist
 * is protected, so the watchlist reason shows only while G8 is off. A season
 * matches the watchlist by its show's ids, as G8 does.
 *
 * @module lib/cleanup/member/reasons
 */

import { notFinished } from "@/lib/cleanup/engine/fields/globals-facts"
import { applicableRequests } from "@/lib/cleanup/engine/fields/request-set"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { MemberReason } from "@/lib/cleanup/types/member"
import { formatDate, type FormatSettings } from "@/lib/utils/format"

/** A row of the member's own `WatchlistSyncHistory`. */
export interface WatchlistEntry {
  mediaType: string
  tmdbId: number | null
  tvdbId: number | null
  imdbId: string | null
  syncedAt: Date
}

/** The member's watchlist by id (`tmdb:1`, `tvdb:2`, `imdb:tt3`), movies apart from shows. */
interface MemberWatchlist {
  movie: ReadonlyMap<string, Date>
  show: ReadonlyMap<string, Date>
}

export interface MemberReasonFact {
  reason: MemberReason
  /** ISO instant of the dated fact. */
  reasonAt: string
}

const isoOf = (seconds: number) => new Date(seconds * 1000).toISOString()

function idsOf(ids: { tmdb?: number | null; tvdb?: number | null; imdb?: string | null }): string[] {
  const keys: string[] = []
  if (ids.tmdb) keys.push(`tmdb:${ids.tmdb}`)
  if (ids.tvdb) keys.push(`tvdb:${ids.tvdb}`)
  if (ids.imdb) keys.push(`imdb:${ids.imdb}`)
  return keys
}

/** The member's watchlist rows by id. A title that two rows hold keeps the newest `syncedAt`. */
export function watchlistIndex(rows: readonly WatchlistEntry[]): MemberWatchlist {
  const movie = new Map<string, Date>()
  const show = new Map<string, Date>()
  for (const row of rows) {
    const target = row.mediaType === "MOVIE" ? movie : row.mediaType === "TV_SERIES" ? show : null
    if (!target) continue
    for (const key of idsOf({ tmdb: row.tmdbId, tvdb: row.tvdbId, imdb: row.imdbId })) {
      const known = target.get(key)
      if (!known || known < row.syncedAt) target.set(key, row.syncedAt)
    }
  }
  return { movie, show }
}

function watchlistAt(item: SnapshotItem, watchlist: MemberWatchlist): Date | null {
  const index = item.level === "movie" ? watchlist.movie : watchlist.show
  const dates = idsOf(item.ids).flatMap((key) => index.get(key) ?? [])
  return dates.length === 0 ? null : new Date(Math.max(...dates.map((date) => date.getTime())))
}

/**
 * The reason that puts the title under For you for this member, or null.
 *
 * @param item - The title in the newest library data
 * @param plexUserId - The member's plex.tv account id
 * @param watchlist - The member's watchlist, or null while G8 is on
 */
export function memberReason(item: SnapshotItem, plexUserId: string, watchlist: MemberWatchlist | null): MemberReasonFact | null {
  const requested = (applicableRequests(item) ?? []).filter((request) => request.by === plexUserId)
  if (requested.length > 0) return { reason: "requested", reasonAt: isoOf(Math.max(...requested.map((request) => request.at))) }

  const viewer = item.plays?.viewers.find((row) => row.user === plexUserId)
  if (viewer && viewer.counted > 0 && viewer.lastCountedAt !== null) {
    const reason = notFinished(viewer, item) ? "started" : "played"
    return { reason, reasonAt: isoOf(viewer.lastCountedAt) }
  }

  const at = watchlist ? watchlistAt(item, watchlist) : null
  return at ? { reason: "watchlist", reasonAt: at.toISOString() } : null
}

/** The reason line of a For you card, in `info` (UX 9.2.3). */
export const REASON_LINES: Readonly<Record<MemberReason, string>> = {
  requested: "You requested this",
  started: "You started this",
  played: "You played this before",
  watchlist: "On your watchlist",
}

/** The dated fact under the reason line: "Your request was in Mar 2025." (UX 9.2.3). */
export function reasonFact(reason: MemberReason, reasonAt: string, settings: FormatSettings): string {
  const when = formatDate(reasonAt, "month-year-short", settings)
  switch (reason) {
    case "requested":
      return `Your request was in ${when}.`
    case "started":
      return `You stopped part-way in ${when}.`
    case "played":
      return `Your last play was ${when}.`
    case "watchlist":
      return `You added it in ${when}.`
  }
}
