/**
 * Movie items of a library read (TS 7.4, 7.5), one per title key over every
 * movie section. Pure and client-safe.
 *
 * | Field | Value |
 * |---|---|
 * | `copies` | each Plex movie with that title key, by section id |
 * | `added.plex` | the newest `addedAt` of the copies |
 * | `added.arr` | Radarr `added` (Unix seconds) |
 * | `sizeBytes` | Radarr `statistics.sizeOnDisk`, else `sizeOnDisk`, else the sum of the managed copy's `Part.size` (with no managed copy, the first copy's), else null |
 * | `arr` | the one Radarr record: id, slug, path, root, tag labels, import list, monitored, `fileId` when `hasFile` |
 * | `labels` | the union of every copy's labels, lower case |
 *
 * The match: `matchToArr` (ids), then the file test (`hasFile` true, else
 * `notManaged` with `noArrFile`), then the path fence. The managed copy is
 * the copy whose files are all inside the movie path, the lowest section id
 * first. So a Movies 4K copy outside the Radarr path is never the managed
 * copy, and its plays still count for the item. A failed Radarr read gives
 * `unknown` with `arrFailed`, `arr: null` and `added.arr: null` (TS 7.8).
 *
 * `plays`, `requests` and `collections` are left empty here: the builder
 * fills them (`builder.ts`).
 *
 * @module lib/cleanup/snapshot/assemble-movies
 */

import { arrRoot, type ArrView, isImportListed, tagLabelsOf } from "@/lib/cleanup/identity/arr"
import {
  epochOf, groupByTitle, mergeIds, newest, sumSizes, type TitleCopy, toTitleCopy, unionLabels, wholeOrNull,
} from "@/lib/cleanup/identity/copies"
import { itemKey } from "@/lib/cleanup/identity/keys"
import { matchToArr, withArrIds } from "@/lib/cleanup/identity/match"
import { bySection, type CopyChoice, fenceFiles, pickManagedCopy, rootOf } from "@/lib/cleanup/identity/path-fence"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { plexPartFiles, type PlexMovieRow, type RadarrMovie } from "@/lib/cleanup/schema/upstream"

/** One Plex movie row: the copy, its `Part.file` paths and the sum of its `Part.size`. */
export interface MovieCopy extends TitleCopy {
  files: string[]
  size: number | null
}

/** A copy of a Plex movie row (P3) of `sectionId`. */
export function toMovieCopy(sectionId: string, row: PlexMovieRow): MovieCopy {
  return {
    ...toTitleCopy(sectionId, row, "movie"),
    files: plexPartFiles(row),
    size: sumSizes(row.Media.flatMap((media) => media.Part.map((part) => part.size))),
  }
}

type Match = SnapshotItem["match"]

interface MovieMatch {
  match: Match
  record: RadarrMovie | null
  choice: CopyChoice<MovieCopy>
}

const firstCopy = (copies: readonly MovieCopy[]): CopyChoice<MovieCopy> => ({ chosen: [...copies].sort(bySection)[0], managed: false, cause: null })

function matchMovie(copies: readonly MovieCopy[], ids: SnapshotItem["ids"], conflict: boolean, radarr: ArrView<RadarrMovie>): MovieMatch {
  if (radarr.state === "failed") return { match: { state: "unknown", cause: "arrFailed" }, record: null, choice: firstCopy(copies) }
  const found = matchToArr(ids, conflict, radarr.index)
  if (found.state !== "matched") return { match: { state: found.state, cause: found.cause }, record: null, choice: firstCopy(copies) }

  const { record, by } = found
  const notManaged = (cause: Match["cause"], choice = firstCopy(copies)): MovieMatch => ({ match: { state: "notManaged", cause, by }, record, choice })
  if (record.hasFile !== true) return notManaged("noArrFile")
  if (rootOf(record.path, radarr.roots) === null) return notManaged("outsideRoot")
  const choice = pickManagedCopy(copies, (copy) => fenceFiles(copy.files, record.path))
  return choice.managed ? { match: { state: "matched", by }, record, choice } : notManaged(choice.cause ?? "outsideArrPath", choice)
}

function arrOf(record: RadarrMovie, radarr: ArrView<RadarrMovie>): NonNullable<SnapshotItem["arr"]> {
  return {
    service: "radarr",
    id: record.id,
    titleSlug: record.titleSlug,
    path: record.path,
    root: arrRoot(radarr, record.path, record.rootFolderPath),
    tags: tagLabelsOf(radarr, record.tags),
    importList: isImportListed(radarr, record.tags),
    monitored: record.monitored,
    ...(record.hasFile === true && record.movieFileId !== undefined ? { fileId: record.movieFileId } : {}),
  }
}

/** One movie item of the copies that share a title key. */
function movieItem(titleKey: string, copies: readonly MovieCopy[], radarr: ArrView<RadarrMovie>): SnapshotItem {
  const merged = mergeIds(copies)
  const { match, record, choice } = matchMovie(copies, merged.ids, merged.conflict, radarr)
  const { chosen } = choice
  const recordSize = record ? (wholeOrNull(record.statistics?.sizeOnDisk) ?? wholeOrNull(record.sizeOnDisk)) : null
  return {
    key: itemKey("movie", titleKey),
    level: "movie",
    titleKey,
    title: chosen.title,
    year: chosen.year,
    seasonNumber: null,
    showKey: null,
    sectionId: chosen.sectionId,
    ratingKey: chosen.ratingKey,
    copies: [...copies].sort(bySection).map((copy) => ({ ratingKey: copy.ratingKey, sectionId: copy.sectionId })),
    episodeKeys: [],
    ids: record ? withArrIds(merged.ids, record, radarr.index) : merged.ids,
    added: { plex: newest(copies.map((copy) => copy.addedAt)), arr: record ? epochOf(record.added) : null },
    sizeBytes: recordSize ?? chosen.size,
    episodeCount: null,
    match,
    arr: record ? arrOf(record, radarr) : null,
    show: null,
    position: null,
    plays: null,
    requests: null,
    collections: [],
    labels: unionLabels(copies),
  }
}

/** The movie items of every movie copy, by item key. */
export function assembleMovies(copies: Iterable<MovieCopy>, radarr: ArrView<RadarrMovie>): SnapshotItem[] {
  return [...groupByTitle(copies)].map(([titleKey, group]) => movieItem(titleKey, group, radarr)).sort((a, b) => (a.key < b.key ? -1 : 1))
}
