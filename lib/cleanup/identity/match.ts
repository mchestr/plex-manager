/**
 * The match of a Plex title to its Radarr or Sonarr record by external id
 * (TS 7.4 `matchToArr`, steps 1 to 4). Pure and client-safe.
 *
 * 1. The index maps each id kind to the records that hold it: Radarr `tmdb`
 *    and `imdb`, Sonarr `tvdb`, `tmdb` and `imdb`. An id that two records
 *    share is ambiguous: it marks both records for that id.
 * 2. The candidates are the records that the item's ids point to, in key
 *    order (`ID_ORDER`).
 * 3. No external id: `unmatched`, cause `noIds`. The item's own `conflict`
 *    flag: `conflicted`, cause `conflictingIds`. No candidate: `unmatched`,
 *    cause `noArrRecord`. Two different candidates, or an ambiguous id:
 *    `conflicted`, cause `twoArrRecords`.
 * 4. One candidate: every other id kind that both the item and the record
 *    hold must agree. One differs: `conflicted`, cause `conflictingIds`.
 *
 * The file test (`noArrFile`) and the path fence come after this, in the
 * assembly. Nothing here reads a title or a year, so nothing ever matches by
 * them (brief 7.4.2).
 *
 * @module lib/cleanup/identity/match
 */

import type { PlexIds } from "@/lib/cleanup/identity/guids"
import { type ExternalIdKind, hasExternalId, ID_ORDER } from "@/lib/cleanup/identity/keys"
import type { MatchCause } from "@/lib/cleanup/schema/snapshot"
import type { RadarrMovie, SonarrSeries } from "@/lib/cleanup/schema/upstream"

/** The external ids of an arr record; a missing or empty id is left out. */
type ArrIds = Partial<Record<ExternalIdKind, number | string | null | undefined>>

export interface ArrIndex<R> {
  /** The id kinds of this arr in key order. */
  kinds: readonly ExternalIdKind[]
  /** Per kind, the records that hold each id value (normalised by `idText`). */
  byId: ReadonlyMap<ExternalIdKind, ReadonlyMap<string, readonly R[]>>
  idsOf(record: R): ArrIds
}

export type ArrMatch<R> =
  | { state: "matched"; by: ExternalIdKind; record: R }
  | { state: "unmatched" | "conflicted"; cause: MatchCause }

/** One id as compared text: numbers as digits, IMDb ids in lower case. Null for no id (0 or empty). */
export function idText(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === "" || value === 0) return null
  return typeof value === "number" ? String(value) : value.toLowerCase()
}

/** An index of `records` over `kinds`. @internal */
export function indexArr<R>(records: readonly R[], kinds: readonly ExternalIdKind[], idsOf: (record: R) => ArrIds): ArrIndex<R> {
  const byId = new Map<ExternalIdKind, Map<string, R[]>>(kinds.map((kind) => [kind, new Map()]))
  for (const record of records) {
    const ids = idsOf(record)
    for (const kind of kinds) {
      const text = idText(ids[kind])
      if (text === null) continue
      const map = byId.get(kind)
      map?.set(text, [...(map.get(text) ?? []), record])
    }
  }
  return { kinds, byId, idsOf }
}

/** The Radarr index: `tmdb`, then `imdb`. */
export function radarrIndex(movies: readonly RadarrMovie[]): ArrIndex<RadarrMovie> {
  return indexArr(movies, ID_ORDER.movie, (movie) => ({ tmdb: movie.tmdbId, imdb: movie.imdbId }))
}

/** The Sonarr index: `tvdb`, then `tmdb`, then `imdb`. */
export function sonarrIndex(series: readonly SonarrSeries[]): ArrIndex<SonarrSeries> {
  return indexArr(series, ID_ORDER.show, (show) => ({ tvdb: show.tvdbId, tmdb: show.tmdbId, imdb: show.imdbId }))
}

/**
 * The record that the item's ids point to (TS 7.4 steps 1 to 4).
 *
 * @param ids - The item's ids (from its Plex guids).
 * @param conflict - The item's own conflict flag: two values for one id kind.
 * @param index - `radarrIndex()` or `sonarrIndex()`.
 */
export function matchToArr<R>(ids: PlexIds, conflict: boolean, index: ArrIndex<R>): ArrMatch<R> {
  if (!hasExternalId(ids)) return { state: "unmatched", cause: "noIds" }
  if (conflict) return { state: "conflicted", cause: "conflictingIds" }

  const candidates = new Set<R>()
  let by: ExternalIdKind | null = null
  for (const kind of index.kinds) {
    const text = idText(ids[kind])
    if (text === null) continue
    const records = index.byId.get(kind)?.get(text) ?? []
    if (records.length > 1) return { state: "conflicted", cause: "twoArrRecords" }
    if (records.length === 1) {
      candidates.add(records[0])
      by ??= kind
    }
  }
  if (candidates.size === 0 || by === null) return { state: "unmatched", cause: "noArrRecord" }
  if (candidates.size > 1) return { state: "conflicted", cause: "twoArrRecords" }

  const [record] = candidates
  const recordIds = index.idsOf(record)
  for (const kind of index.kinds) {
    const mine = idText(ids[kind])
    const theirs = idText(recordIds[kind])
    if (mine !== null && theirs !== null && mine !== theirs) return { state: "conflicted", cause: "conflictingIds" }
  }
  return { state: "matched", by, record }
}

/**
 * The item's ids with the ids of its one matched record added where Plex has
 * none. A Plex id always stays, so the title key never changes. More ids let
 * the watchlist (G8) and the requests find the item.
 */
export function withArrIds<R>(ids: PlexIds, record: R, index: ArrIndex<R>): PlexIds {
  const out: PlexIds = { ...ids }
  const recordIds = index.idsOf(record)
  for (const kind of index.kinds) {
    const text = idText(recordIds[kind])
    if (out[kind] !== undefined || text === null) continue
    if (kind === "imdb") out.imdb = text
    else if (/^\d+$/.test(text)) out[kind] = Number(text)
  }
  return out
}
