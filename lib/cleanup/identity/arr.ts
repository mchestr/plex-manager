/**
 * The Radarr or Sonarr side of a library read (TS 7.3 step 3): the records,
 * their index, the root folders, the tag label map and the import-list tags.
 * Pure and client-safe.
 *
 * A view is `ok` only when the source status is `ok` and the read's data is
 * there. `failed` gives every item of the level `unknown` with cause
 * `arrFailed` (TS 7.8). `notConfigured` has no records, so its items are
 * `unmatched` (`noArrRecord`) and never delete.
 *
 * @module lib/cleanup/identity/arr
 */

import { type ArrIndex, radarrIndex, sonarrIndex } from "@/lib/cleanup/identity/match"
import { rootOf } from "@/lib/cleanup/identity/path-fence"
import type { SourceState } from "@/lib/cleanup/schema/snapshot"
import type { ArrDisk, ArrTag, RadarrMovie, SonarrSeries } from "@/lib/cleanup/schema/upstream"

/** What the read gives for one arr app (R1 to R5, S1 to S5). */
export interface ArrRead<R> {
  /** R2 or S2. */
  records: readonly R[]
  /** R1 or S1. */
  rootFolders: readonly { path: string }[]
  /** R3 or S3: tag ids and labels. */
  tags: readonly ArrTag[]
  /** R4 or S4: the tags of each import list. */
  importLists: readonly { tags: readonly number[] }[]
  /** R5 or S5. */
  disk: readonly ArrDisk[]
}

export interface ArrView<R> {
  state: SourceState
  records: readonly R[]
  index: ArrIndex<R>
  roots: string[]
  disk: readonly ArrDisk[]
  /** Tag id to label, lower case. */
  tagLabels: ReadonlyMap<number, string>
  /** Tag ids that an import list carries. */
  importTags: ReadonlySet<number>
}

function viewOf<R>(state: SourceState, read: ArrRead<R> | null | undefined, index: (records: readonly R[]) => ArrIndex<R>): ArrView<R> {
  const usable = state === "ok" && read ? read : null
  const records = usable?.records ?? []
  return {
    state: state === "ok" && !read ? "failed" : state,
    records,
    index: index(records),
    roots: (usable?.rootFolders ?? []).map((root) => root.path),
    disk: usable?.disk ?? [],
    tagLabels: new Map((usable?.tags ?? []).map((tag) => [tag.id, tag.label.trim().toLowerCase()])),
    importTags: new Set((usable?.importLists ?? []).flatMap((list) => list.tags)),
  }
}

/** The Radarr view of a read. An `ok` state with no data reads as `failed`. */
export function radarrView(state: SourceState, read: ArrRead<RadarrMovie> | null | undefined): ArrView<RadarrMovie> {
  return viewOf(state, read, radarrIndex)
}

/** The Sonarr view of a read. An `ok` state with no data reads as `failed`. */
export function sonarrView(state: SourceState, read: ArrRead<SonarrSeries> | null | undefined): ArrView<SonarrSeries> {
  return viewOf(state, read, sonarrIndex)
}

/** The labels of a record's tag ids, lower case, sorted. Unknown ids are left out. */
export function tagLabelsOf(view: ArrView<unknown>, tagIds: readonly number[]): string[] {
  const labels = tagIds.map((id) => view.tagLabels.get(id)).filter((label): label is string => label !== undefined && label !== "")
  return [...new Set(labels)].sort()
}

/** Whether a record carries a tag of an import list. */
export function isImportListed(view: ArrView<unknown>, tagIds: readonly number[]): boolean {
  return tagIds.some((id) => view.importTags.has(id))
}

/** The root of a record: its own root folder when given, else the root folder that holds its path. */
export function arrRoot(view: ArrView<unknown>, path: string, own?: string | null): string {
  return own || rootOf(path, view.roots) || ""
}
