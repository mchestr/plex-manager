/**
 * The snapshot builder: the one way a library read turns upstream rows into
 * snapshot items and facts (TS 7.3 to 7.8). Pure: it imports no server
 * module, calls no service and keeps no raw history row.
 *
 * ## API (frozen after the wave 2 gate, plan 2.3; used by `read.ts`)
 *
 * ```ts
 * const builder = createSnapshotBuilder({ takenAt, sections })    // P1
 * builder.addMovies(sectionId, rows)       // P3 pages, plexMovieRow
 * builder.addShows(sectionId, rows)        // P4 pages, plexShowRow
 * builder.addSeasons(sectionId, rows)      // P5 pages, plexSeasonRow
 * builder.addEpisodes(sectionId, rows)     // P6 pages, plexEpisodeRow
 * builder.addCollections(sectionId, rows)  // P7, plexCollectionRow
 * builder.addCollectionMembers(title, rows) // P8 of one collection; null when that read failed
 * builder.addHistory(rows)                 // T1 pages, after every Plex row
 * builder.addRequests(rows)                // O2 pages, any time
 * const { items, facts } = builder.finish({ sources, access, radarr, sonarr, overseerrUsers })
 * ```
 *
 * 1. Plex rows can come in any order and page by page. A repeated rating key
 *    keeps its first row. The first `addHistory` call builds the history
 *    maps, so a Plex row after it throws.
 * 2. `finish()` takes the source results and everything that is not paged:
 *    the P2 access list and owner, the Radarr and Sonarr reads (R1 to R5,
 *    S1 to S5) and the O1 user index. It returns the items of each level,
 *    sorted by key, and the facts with `rowBaseline: {}`. The reader then
 *    sets `facts.rowBaseline = rowBaseline(prev, read)` (`baseline.ts`).
 * 3. The item effects of TS 7.8, by source state: Tautulli not `ok` gives
 *    `plays: null` on every item. Overseerr not `ok` gives `requests: null`.
 *    A failed Radarr or Sonarr gives the items of its levels `unknown`
 *    (`arrFailed`), `arr: null`, `added.arr: null` and, for Sonarr,
 *    `show: null`. A failed share list (or no owner id) gives `hasAccess:
 *    null` for every user. A missing source status counts as failed.
 * 4. `collections` of an item: the titles whose members hold one of its copy
 *    keys or episode keys. A show also takes its seasons', and a season its
 *    show copies'. `membersRead` lists the titles read without a failure.
 *
 * @module lib/cleanup/snapshot/builder
 */

import { type ArrRead, radarrView, sonarrView } from "@/lib/cleanup/identity/arr"
import { epochOf, toTitleCopy, type TitleCopy, wholeOrNull } from "@/lib/cleanup/identity/copies"
import { type ShowStore, toEpisodeCopy, toSeasonCopy } from "@/lib/cleanup/identity/episodes"
import type { SnapshotFacts, SnapshotItem, SourceState, SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type {
  HistoryRow, PlexCollectionItemRow, PlexCollectionRow, PlexEpisodeRow, PlexMovieRow, PlexSeasonRow, PlexSection, PlexShowRow, RadarrMovie,
  SeerrRequest, SonarrSeries,
} from "@/lib/cleanup/schema/upstream"
import { assembleMovies, type MovieCopy, toMovieCopy } from "@/lib/cleanup/snapshot/assemble-movies"
import { assembleShows } from "@/lib/cleanup/snapshot/assemble-shows"
import { buildFacts, buildUsers, collectionTitles } from "@/lib/cleanup/snapshot/facts"
import { buildHistoryMaps, createHistoryIndex, type HistoryIndex } from "@/lib/cleanup/snapshot/history-index"
import { createRequestLog, indexRequests, invertUserIndex } from "@/lib/cleanup/snapshot/requests"
import type { Level, Service } from "@/lib/validations/cleanup-vocabulary"

export interface SnapshotBuilderInput {
  /** The start of the first source read (ISO): `facts.takenAt`, and the clock of the growth window. */
  takenAt: string
  /** P1: every Plex section. Only `movie` and `show` sections become libraries. */
  sections: readonly PlexSection[]
}

export interface PlexAccessInput {
  /** P2 (`readPlexAccess`): plex.tv ids of accepted shares and managed Home users. Null when P2 failed. */
  userIds: readonly string[] | null
  /** `PlexServer.adminPlexUserId`. Null, or not digits: `hasAccess` is null for every user. */
  ownerId: string | null
  machineIdentifier: string | null
}

export interface SnapshotFinishInput {
  /** Every `SourceStatus` of the read. Plex `part: "shares"` is the share list. */
  sources: readonly SourceStatus[]
  access: PlexAccessInput
  radarr?: ArrRead<RadarrMovie> | null
  sonarr?: ArrRead<SonarrSeries> | null
  /** O1 (`buildOverseerrUserIndex`): plex.tv id to Overseerr user id. */
  overseerrUsers?: ReadonlyMap<number, number> | null
}

export interface SnapshotBuild {
  items: Record<Level, SnapshotItem[]>
  facts: SnapshotFacts
}

export interface SnapshotBuilder {
  addMovies(sectionId: string, rows: readonly PlexMovieRow[]): void
  addShows(sectionId: string, rows: readonly PlexShowRow[]): void
  addSeasons(sectionId: string, rows: readonly PlexSeasonRow[]): void
  addEpisodes(sectionId: string, rows: readonly PlexEpisodeRow[]): void
  addCollections(sectionId: string, rows: readonly PlexCollectionRow[]): void
  addCollectionMembers(title: string, rows: readonly PlexCollectionItemRow[] | null): void
  addHistory(rows: readonly HistoryRow[]): void
  addRequests(rows: readonly SeerrRequest[]): void
  finish(input: SnapshotFinishInput): SnapshotBuild
}

function stateOf(sources: readonly SourceStatus[], service: Service, part?: "shares"): SourceState {
  const status = sources.find((s) => s.service === service && (part ? s.part === part : s.part !== "shares"))
  return status?.state ?? "failed"
}

function addOnce<T extends { ratingKey: string }>(map: Map<string, T>, copies: Iterable<T>): void {
  for (const copy of copies) if (!map.has(copy.ratingKey)) map.set(copy.ratingKey, copy)
}

/** A builder for one library read. */
export function createSnapshotBuilder(input: SnapshotBuilderInput): SnapshotBuilder {
  const movies = new Map<string, MovieCopy>()
  const store: ShowStore = { shows: new Map(), seasons: new Map(), episodes: new Map() }
  const labelsRead = new Set<string>()
  const collections = new Map<string, SnapshotFacts["collections"][number]>()
  const members = new Map<string, Set<string>>()
  const titlesRead = new Set<string>()
  const titlesFailed = new Set<string>()
  const requests = createRequestLog()
  let history: HistoryIndex | null = null
  const historyOf = () => (history ??= createHistoryIndex(buildHistoryMaps(movies.values(), store)))
  const plexOpen = () => {
    if (history) throw new Error("createSnapshotBuilder: a Plex row came after the history")
  }
  const titleRows = (sectionId: string, rows: readonly (PlexMovieRow | PlexShowRow)[]) => {
    plexOpen()
    if (rows.some((row) => row.Label.length > 0)) labelsRead.add(sectionId)
  }

  return {
    addMovies(sectionId, rows) {
      titleRows(sectionId, rows)
      addOnce(movies, rows.map((row) => toMovieCopy(sectionId, row)))
    },
    addShows(sectionId, rows) {
      titleRows(sectionId, rows)
      addOnce<TitleCopy>(store.shows, rows.map((row) => toTitleCopy(sectionId, row, "show")))
    },
    addSeasons(sectionId, rows) {
      plexOpen()
      addOnce(store.seasons, rows.map((row) => toSeasonCopy(sectionId, row)))
    },
    addEpisodes(sectionId, rows) {
      plexOpen()
      addOnce(store.episodes, rows.map((row) => toEpisodeCopy(sectionId, row)))
    },
    addCollections(sectionId, rows) {
      for (const row of rows) {
        if (collections.has(row.ratingKey)) continue
        collections.set(row.ratingKey, { sectionId, ratingKey: row.ratingKey, title: row.title, childCount: wholeOrNull(row.childCount) ?? 0,
          smart: row.smart === true || row.smart === 1 })
      }
    },
    addCollectionMembers(title, rows) {
      titlesRead.add(title)
      if (rows === null) titlesFailed.add(title)
      for (const row of rows ?? []) members.set(row.ratingKey, (members.get(row.ratingKey) ?? new Set()).add(title))
    },
    addHistory: (rows) => historyOf().add(rows),
    addRequests: (rows) => requests.add(rows),

    finish(finishInput) {
      const state = (service: Service) => stateOf(finishInput.sources, service)
      const radarr = radarrView(state("radarr"), finishInput.radarr)
      const sonarr = sonarrView(state("sonarr"), finishInput.sonarr)
      const movieItems = assembleMovies(movies.values(), radarr)
      const shows = assembleShows(store, sonarr)
      const watched = state("tautulli") === "ok" ? historyOf() : null
      const takenAtS = epochOf(input.takenAt) ?? 0
      const users = invertUserIndex(finishInput.overseerrUsers ?? new Map())
      const asked = state("overseerr") === "ok" ? indexRequests(requests.pending(), users, takenAtS, shows.shows) : null

      const collectionsOf = collectionTitles(shows, members)
      const done = (item: SnapshotItem): SnapshotItem => ({
        ...item,
        plays: watched ? watched.playsOf(item, shows.onDisk.get(item.key)) : null,
        requests: asked ? asked.forItem(item) : null,
        collections: collectionsOf(item),
      })
      const items = { movie: movieItems.map(done), show: shows.shows.map(done), season: shows.seasons.map(done) }

      const { access } = finishInput
      const sharesOk = stateOf(finishInput.sources, "plex", "shares") === "ok"
      const facts = buildFacts({
        takenAt: input.takenAt, sections: input.sections, movies: [...movies.values()], store, items, radarr, sonarr,
        history: watched ? watched.stats() : { startAt: null, newestAt: null, rows: 0, orphans: 0, usersWithPlay: 0 },
        users: buildUsers({ access: sharesOk ? access.userIds : null, ownerId: access.ownerId, lastPlays: watched?.lastPlays() ?? null,
          requesters: asked?.requesters ?? [] }),
        collections: [...collections.values()],
        membersRead: [...titlesRead].filter((title) => !titlesFailed.has(title)).sort(),
        labelsRead: [...labelsRead].sort((a, b) => Number(a) - Number(b)),
        machineIdentifier: access.machineIdentifier,
      })
      return { items, facts }
    },
  }
}
