/**
 * Show and season items of a library read (TS 7.4, 7.5), per show title key
 * over every show section. Pure and client-safe.
 *
 * | Field | Show item | Season item |
 * |---|---|---|
 * | `added.plex` | newest show `addedAt` of the copies | newest `addedAt` of the season copies |
 * | `added.arr` | Sonarr `added` | Sonarr `added` |
 * | `sizeBytes` | Sonarr `statistics.sizeOnDisk`, else the sum of episode `Part.size` | Sonarr `seasons[n].statistics.sizeOnDisk`, else the sum of the season's episode sizes |
 * | `episodeCount` | episodes with a `Part`, specials left out (an episode whose season is not known counts) | episodes with a `Part` in the season |
 * | `episodeKeys` | every episode rating key of the copies | the season's episode rating keys |
 * | `show` | Sonarr `status`, seasons on disk, the newest one, newest episode `addedAt` (all seasons, specials too) | the same, with the season's newest episode |
 * | `position` | null | rank among the Sonarr seasons on disk, newest first |
 * | `arr.fileCount` | Sonarr episode files of seasons 1 and up | Sonarr episode files of season n |
 * | `labels` | the union of every copy's labels | `[]` |
 *
 * The show match: `matchToArr`, the file test (`episodeFileCount > 0`, else
 * `noArrFile`), then the fence. A season item needs a Plex season with an
 * index of 1 or more and an episode on disk. Season 0 gives no item, and its
 * plays count for the show. A season of a matched show is `notManaged` with
 * `noArrSeason` (no Sonarr season), `seasonMismatch` (the numbering check of
 * `season-check.ts` fails), `noArrFile` or a fence cause. Every other season
 * takes its show's match. A failed Sonarr read gives `unknown`, `arrFailed`,
 * `arr: null`, `added.arr: null` and `show: null` (TS 7.8).
 *
 * @module lib/cleanup/snapshot/assemble-shows
 */

import { arrRoot, type ArrView, isImportListed, tagLabelsOf } from "@/lib/cleanup/identity/arr"
import { epochOf, groupCopies, mergeIds, newest, sumSizes, type TitleCopy, unionLabels, wholeOrNull } from "@/lib/cleanup/identity/copies"
import { type EpisodeCopy, indexShows, type SeasonCopy, type ShowIndex, showParts, type ShowStore } from "@/lib/cleanup/identity/episodes"
import { itemKey, seasonItemKey } from "@/lib/cleanup/identity/keys"
import { matchToArr, withArrIds } from "@/lib/cleanup/identity/match"
import { bySection, type CopyChoice, fenceFiles, pickManagedCopy, rootOf } from "@/lib/cleanup/identity/path-fence"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { sonarrFileCount, type SonarrSeries } from "@/lib/cleanup/schema/upstream"
import { plexSeasonFiles, seasonNumberingMatches, seasonPosition, sonarrSeasonsOnDisk } from "@/lib/cleanup/snapshot/season-check"

type Match = SnapshotItem["match"]

/** The show and season items, and per item key the episodes on disk that "finished" counts (specials left out). */
export interface ShowAssembly {
  shows: SnapshotItem[]
  seasons: SnapshotItem[]
  onDisk: Map<string, Set<string>>
}

interface ShowMatch {
  match: Match
  record: SonarrSeries | null
  choice: CopyChoice<TitleCopy>
}

const keysOf = (episodes: readonly EpisodeCopy[]) => episodes.map((e) => e.ratingKey).sort((a, b) => Number(a) - Number(b))
const withFiles = (episodes: readonly EpisodeCopy[]) => episodes.filter((e) => e.files.length > 0)
const byKey = (a: SnapshotItem, b: SnapshotItem) => (a.key < b.key ? -1 : 1)

function matchShow(copies: readonly TitleCopy[], ids: SnapshotItem["ids"], conflict: boolean, sonarr: ArrView<SonarrSeries>,
  files: (copy: TitleCopy) => string[]): ShowMatch {
  const first: CopyChoice<TitleCopy> = { chosen: [...copies].sort(bySection)[0], managed: false, cause: null }
  if (sonarr.state === "failed") return { match: { state: "unknown", cause: "arrFailed" }, record: null, choice: first }
  const found = matchToArr(ids, conflict, sonarr.index)
  if (found.state !== "matched") return { match: { state: found.state, cause: found.cause }, record: null, choice: first }

  const { record, by } = found
  const notManaged = (cause: Match["cause"], choice = first): ShowMatch => ({ match: { state: "notManaged", cause, by }, record, choice })
  if (!((record.statistics?.episodeFileCount ?? sonarrFileCount(record)) > 0)) return notManaged("noArrFile")
  if (rootOf(record.path, sonarr.roots) === null) return notManaged("outsideRoot")
  const choice = pickManagedCopy(copies, (copy) => fenceFiles(files(copy), record.path))
  return choice.managed ? { match: { state: "matched", by }, record, choice } : notManaged(choice.cause ?? "outsideArrPath", choice)
}

function arrOf(record: SonarrSeries, sonarr: ArrView<SonarrSeries>, seasonNumber?: number): NonNullable<SnapshotItem["arr"]> {
  return {
    service: "sonarr", id: record.id, titleSlug: record.titleSlug, path: record.path, root: arrRoot(sonarr, record.path),
    tags: tagLabelsOf(sonarr, record.tags), importList: isImportListed(sonarr, record.tags), monitored: record.monitored,
    fileCount: sonarrFileCount(record, seasonNumber),
  }
}

function seasonMatch(show: ShowMatch, n: number, numberingOk: boolean, managedSeason: SeasonCopy | undefined, files: string[]): Match {
  const { match, record } = show
  if (match.state !== "matched" || !record) return match
  const notManaged = (cause: Match["cause"]): Match => ({ state: "notManaged", cause, by: match.by })
  if (!record.seasons.some((s) => s.seasonNumber === n)) return notManaged("noArrSeason")
  if (!numberingOk) return notManaged("seasonMismatch")
  if (sonarrFileCount(record, n) === 0) return notManaged("noArrFile")
  const cause = managedSeason ? fenceFiles(files, record.path) : "noPlexFile"
  return cause === null ? match : notManaged(cause)
}

function showAssembly(titleKey: string, copies: readonly TitleCopy[], store: ShowStore, index: ShowIndex, sonarr: ArrView<SonarrSeries>,
  out: ShowAssembly): void {
  const parts = showParts(store, index, copies)
  const merged = mergeIds(copies)
  const shown = matchShow(copies, merged.ids, merged.conflict, sonarr, (copy) => parts.episodesOf(copy.ratingKey).flatMap((e) => e.files))
  const { record, choice } = shown
  const managedEpisodes = parts.episodesOf(choice.chosen.ratingKey)
  const numberingOk = record !== null && choice.managed
    && seasonNumberingMatches(plexSeasonFiles(managedEpisodes.map((e) => ({ seasonNumber: parts.seasonOf(e), files: e.files }))), record)
  const sonarrSeasons = record ? sonarrSeasonsOnDisk(record) : null
  const ids = record ? withArrIds(merged.ids, record, sonarr.index) : merged.ids
  const showKey = itemKey("show", titleKey)
  const facts = (lastEpisodeAddedAt: number | null): SnapshotItem["show"] => sonarr.state === "failed" ? null : {
    status: record?.status ?? null, seasonsOnDisk: sonarrSeasons ? sonarrSeasons.length : null,
    newestSeasonOnDisk: sonarrSeasons?.at(-1) ?? null, lastEpisodeAddedAt,
  }
  const base = {
    titleKey, title: choice.chosen.title, year: choice.chosen.year, ids, collections: [], plays: null, requests: null,
    added: { plex: newest(copies.map((c) => c.addedAt)), arr: record ? epochOf(record.added) : null },
  }
  const countable = withFiles(parts.episodes).filter((e) => parts.seasonOf(e) !== 0)
  out.onDisk.set(showKey, new Set(countable.map((e) => e.ratingKey)))
  out.shows.push({
    ...base, key: showKey, level: "show", seasonNumber: null, showKey: null, sectionId: choice.chosen.sectionId, ratingKey: choice.chosen.ratingKey,
    copies: [...copies].sort(bySection).map((c) => ({ ratingKey: c.ratingKey, sectionId: c.sectionId })),
    episodeKeys: keysOf(parts.episodes), episodeCount: countable.length, match: shown.match, arr: record ? arrOf(record, sonarr) : null,
    sizeBytes: wholeOrNull(record?.statistics?.sizeOnDisk) ?? sumSizes(managedEpisodes.map((e) => e.size)),
    show: facts(newest(parts.episodes.map((e) => e.addedAt))), position: null, labels: unionLabels(copies),
  })

  for (const [n, seasonCopies] of parts.seasonsByNumber()) {
    const episodes = parts.episodesOfSeasons(seasonCopies)
    if (withFiles(episodes).length === 0) continue
    const managedSeason = choice.managed ? seasonCopies.find((s) => s.showRatingKey === choice.chosen.ratingKey) : undefined
    const chosen = managedSeason ?? [...seasonCopies].sort(bySection)[0]
    const chosenEpisodes = parts.episodesOfSeasons([chosen])
    const key = seasonItemKey(titleKey, n)
    out.onDisk.set(key, new Set(withFiles(episodes).map((e) => e.ratingKey)))
    out.seasons.push({
      ...base, key, level: "season", seasonNumber: n, showKey, sectionId: chosen.sectionId, ratingKey: chosen.ratingKey,
      added: { ...base.added, plex: newest(seasonCopies.map((s) => s.addedAt)) },
      copies: [...seasonCopies].sort(bySection).map((s) => ({ ratingKey: s.ratingKey, sectionId: s.sectionId })),
      episodeKeys: keysOf(episodes), episodeCount: withFiles(episodes).length,
      match: seasonMatch(shown, n, numberingOk, managedSeason, chosenEpisodes.flatMap((e) => e.files)),
      arr: record ? arrOf(record, sonarr, n) : null,
      sizeBytes: wholeOrNull(record?.seasons.find((s) => s.seasonNumber === n)?.statistics?.sizeOnDisk) ?? sumSizes(chosenEpisodes.map((e) => e.size)),
      show: facts(newest(episodes.map((e) => e.addedAt))), position: sonarrSeasons ? seasonPosition(n, sonarrSeasons) : null, labels: [],
    })
  }
}

/** The show and season items of every show copy in `store`, each sorted by item key. */
export function assembleShows(store: ShowStore, sonarr: ArrView<SonarrSeries>): ShowAssembly {
  const out: ShowAssembly = { shows: [], seasons: [], onDisk: new Map() }
  const index = indexShows(store)
  for (const [titleKey, copies] of groupCopies(store.shows.values(), "show")) showAssembly(titleKey, copies, store, index, sonarr, out)
  out.shows.sort(byKey)
  out.seasons.sort(byKey)
  return out
}
