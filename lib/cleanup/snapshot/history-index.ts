/**
 * The history index (TS 7.6): Tautulli history rows streamed onto snapshot
 * items, with no raw row kept. Pure and client-safe.
 *
 * The maps, built once from the Plex rows before the first history row:
 *
 * | Map | Key | Value |
 * |---|---|---|
 * | `movieByKey` | every movie copy rating key | movie item key |
 * | `movieByGuid` | primary `guid` of every movie copy | movie item key |
 * | `episodeByKey` | every episode rating key | `{ seasonKey or null, showKey, episodeKey }` |
 * | `episodeByGuid` | primary `guid` of every episode | same |
 * | `seasonByKey` | every season rating key | `{ seasonKey, showKey }` |
 * | `showByKey` | every show copy rating key | `showKey` |
 *
 * For each row (a repeated `row_id` is dropped) with `live = 0`:
 *
 * 0. Before a guid match, strip `?lang=...` from both guids.
 * 1. `movie`: by `rating_key`, else `guid`.
 * 2. `episode`: by `rating_key`, else `guid`, else `parent_rating_key`
 *    (season), else `grandparent_rating_key` (show, season unknown).
 * 3. Other media types: skipped. 4. No match: an orphan.
 * 5. Per item (the movie, or the season and the show), with the user id:
 *    a counted play (`isCountedPlay`) adds to `countedAt` and the viewer's
 *    `counted`, `lastCountedAt` and `lastCountedFinished`. A finished play
 *    (`isFinished`) sets a movie viewer's `finished`, or adds the episode to
 *    the viewer's finished set of the season and the show. Specials (season
 *    0) count for the show's plays, never for its finished set.
 * 6. Per user: `lastPlayAt` is the newest counted `started`, over every row
 *    (live rows too). `usersWithPlay` counts the users with one.
 * 7. `startAt` and `newestAt`: the oldest and newest `started` of any row.
 * 8. `playsOf()`: `finishedEpisodes` counts the finished set that is still on
 *    disk. A show or season viewer is `finished` when `episodeCount > 0` and
 *    `finishedEpisodes >= episodeCount`.
 *
 * @module lib/cleanup/snapshot/history-index
 */

import { type TitleCopy, titleKeysOf, wholeOrNull } from "@/lib/cleanup/identity/copies"
import { seasonNumberOf, type ShowStore } from "@/lib/cleanup/identity/episodes"
import { stripLang } from "@/lib/cleanup/identity/guids"
import { itemKey, seasonItemKey } from "@/lib/cleanup/identity/keys"
import { isCountedPlay, isFinished } from "@/lib/cleanup/engine/plays"
import type { SnapshotFacts, SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { HistoryRow } from "@/lib/cleanup/schema/upstream"

/** Where an episode, season or show row leads. `episodeKey` is null for a season or show match. */
export interface EpisodeRef {
  showKey: string
  seasonKey: string | null
  episodeKey: string | null
  special: boolean
}

export interface HistoryMaps {
  movieByKey: Map<string, string>
  movieByGuid: Map<string, string>
  episodeByKey: Map<string, EpisodeRef>
  episodeByGuid: Map<string, EpisodeRef>
  seasonByKey: Map<string, EpisodeRef>
  showByKey: Map<string, string>
}

type Plays = NonNullable<SnapshotItem["plays"]>
interface ViewerAcc { counted: number; lastCountedAt: number | null; lastCountedFinished: boolean; finished: boolean; episodes: Set<string> }
interface PlayAcc { countedAt: number[]; viewers: Map<string, ViewerAcc> }
interface Target { key: string; episodeKey: string | null; movie: boolean }

export interface HistoryIndex {
  /** Stream one page of rows into the index. */
  add(rows: readonly HistoryRow[]): void
  /** The plays of one item. `onDisk`: the item's episode keys with a file (shows: specials left out). */
  playsOf(item: Pick<SnapshotItem, "key" | "level" | "episodeCount">, onDisk?: ReadonlySet<string>): Plays
  /** Every plex.tv id seen in the history, with its newest counted play. */
  lastPlays(): ReadonlyMap<string, number | null>
  stats(): SnapshotFacts["history"]
}

function addGuid<V>(map: Map<string, V>, guid: string | null, value: V): void {
  if (!guid) return
  const key = stripLang(guid)
  if (!map.has(key)) map.set(key, value)
}

/** The maps of TS 7.6, from every movie copy and the show store. */
export function buildHistoryMaps(movies: Iterable<TitleCopy>, store: ShowStore): HistoryMaps {
  const maps: HistoryMaps = { movieByKey: new Map(), movieByGuid: new Map(), episodeByKey: new Map(), episodeByGuid: new Map(),
    seasonByKey: new Map(), showByKey: new Map() }
  // The item keys of the copy groups, as the assembly makes them (`groupCopies`)
  const movieList = [...movies]
  const movieKeys = titleKeysOf(movieList, "movie")
  const showKeys = titleKeysOf(store.shows.values(), "show")
  for (const movie of movieList) {
    const key = itemKey("movie", movieKeys.get(movie.ratingKey) ?? movie.titleKey)
    maps.movieByKey.set(movie.ratingKey, key)
    addGuid(maps.movieByGuid, movie.guid, key)
  }
  const showTitleKey = (show: TitleCopy) => showKeys.get(show.ratingKey) ?? show.titleKey
  for (const show of store.shows.values()) maps.showByKey.set(show.ratingKey, itemKey("show", showTitleKey(show)))
  const ref = (showRatingKey: string, n: number | null): EpisodeRef | null => {
    const show = store.shows.get(showRatingKey)
    if (!show) return null
    const key = showTitleKey(show)
    return { showKey: itemKey("show", key), seasonKey: n !== null && n >= 1 ? seasonItemKey(key, n) : null, episodeKey: null, special: n === 0 }
  }
  for (const season of store.seasons.values()) {
    const found = ref(season.showRatingKey, season.index)
    if (found) maps.seasonByKey.set(season.ratingKey, found)
  }
  for (const episode of store.episodes.values()) {
    const found = ref(episode.showRatingKey, seasonNumberOf(store, episode))
    if (!found) continue
    const full = { ...found, episodeKey: episode.ratingKey }
    maps.episodeByKey.set(episode.ratingKey, full)
    addGuid(maps.episodeByGuid, episode.guid, full)
  }
  return maps
}

const userOf = (id: number) => (Number.isSafeInteger(id) && id >= 0 ? String(id) : null)
const byGuid = <V>(map: Map<string, V>, guid: string | null) => (guid ? map.get(stripLang(guid)) : undefined)

/** An empty index over `maps`; rows stream in with `add()`. */
export function createHistoryIndex(maps: HistoryMaps): HistoryIndex {
  const seen = new Set<string>()
  const plays = new Map<string, PlayAcc>()
  const users = new Map<string, number | null>()
  const stats = { startAt: null as number | null, newestAt: null as number | null, rows: 0, orphans: 0 }

  function resolve(row: HistoryRow): Target[] | null {
    if (row.media_type === "movie") {
      const key = maps.movieByKey.get(row.rating_key) ?? byGuid(maps.movieByGuid, row.guid)
      return key ? [{ key, episodeKey: null, movie: true }] : null
    }
    if (row.media_type !== "episode") return []
    const showKey = row.grandparent_rating_key ? maps.showByKey.get(row.grandparent_rating_key) : undefined
    const ref = maps.episodeByKey.get(row.rating_key) ?? byGuid(maps.episodeByGuid, row.guid)
      ?? (row.parent_rating_key ? maps.seasonByKey.get(row.parent_rating_key) : undefined)
      ?? (showKey ? { showKey, seasonKey: null, episodeKey: null, special: false } : undefined)
    if (!ref) return null
    const targets: Target[] = [{ key: ref.showKey, episodeKey: ref.special ? null : ref.episodeKey, movie: false }]
    if (ref.seasonKey) targets.push({ key: ref.seasonKey, episodeKey: ref.episodeKey, movie: false })
    return targets
  }

  function record(target: Target, user: string | null, started: number, counted: boolean, finished: boolean): void {
    let acc = plays.get(target.key)
    if (!acc) plays.set(target.key, (acc = { countedAt: [], viewers: new Map() }))
    if (counted) acc.countedAt.push(started)
    if (user === null || (!counted && !finished)) return
    let viewer = acc.viewers.get(user)
    if (!viewer) acc.viewers.set(user, (viewer = { counted: 0, lastCountedAt: null, lastCountedFinished: false, finished: false, episodes: new Set() }))
    if (counted) {
      viewer.counted += 1
      if (viewer.lastCountedAt === null || started >= viewer.lastCountedAt) {
        viewer.lastCountedAt = started
        viewer.lastCountedFinished = finished
      }
    }
    if (finished && target.movie) viewer.finished = true
    else if (finished && target.episodeKey) viewer.episodes.add(target.episodeKey)
  }

  function addRow(row: HistoryRow): void {
    if (row.row_id !== null) {
      if (seen.has(row.row_id)) return
      seen.add(row.row_id)
    }
    stats.rows += 1
    const started = wholeOrNull(row.started)
    if (started === null) return
    if (stats.startAt === null || started < stats.startAt) stats.startAt = started
    if (stats.newestAt === null || started > stats.newestAt) stats.newestAt = started
    const counted = isCountedPlay({ playSeconds: row.play_duration, percentComplete: row.percent_complete })
    const finished = isFinished({ watchedStatus: row.watched_status, percentComplete: row.percent_complete })
    const user = userOf(row.user_id)
    if (user !== null) {
      const last = users.get(user) ?? null
      users.set(user, counted && (last === null || started > last) ? started : last)
    }
    if (row.live !== 0) return
    const targets = resolve(row)
    if (targets === null) stats.orphans += 1
    else for (const target of targets) record(target, user, started, counted, finished)
  }

  return {
    add: (rows) => rows.forEach(addRow),
    playsOf(item, onDisk) {
      const acc = plays.get(item.key)
      if (!acc) return { lastCountedAt: null, countedAt: [], viewers: [] }
      const countedAt = [...acc.countedAt].sort((a, b) => a - b)
      const episodeCount = item.episodeCount ?? 0
      const viewers = [...acc.viewers].map(([user, v]) => {
        const finishedEpisodes = item.level === "movie" ? 0 : [...v.episodes].filter((key) => onDisk?.has(key)).length
        const finished = item.level === "movie" ? v.finished : episodeCount > 0 && finishedEpisodes >= episodeCount
        return { user, lastCountedAt: v.lastCountedAt, lastCountedFinished: v.lastCountedFinished, counted: v.counted, finished, finishedEpisodes }
      })
      return { lastCountedAt: countedAt.at(-1) ?? null, countedAt, viewers: viewers.sort((a, b) => Number(a.user) - Number(b.user)) }
    },
    lastPlays: () => users,
    stats: () => ({ ...stats, usersWithPlay: [...users.values()].filter((at) => at !== null).length }),
  }
}
