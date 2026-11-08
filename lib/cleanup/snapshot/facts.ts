/**
 * The server-wide facts of a library read (TS 7.7) and the users of TS 7.6.
 * Pure and client-safe.
 *
 * | Fact | Value |
 * |---|---|
 * | `libraries[]` | One per Plex movie or show section. `arr`: a location and a root folder of the level's arr overlap (`isInside` either way). `noIds`: agent `com.plexapp.agents.none`, or no copy with an external id. Counts and bytes are over managed (matched) items. |
 * | `disk` | Per arr root folder, the diskspace entry with the longest `path` that holds it. Deduplicated by `path`, then summed. Null when no arr answered or no entry holds a root. |
 * | `growthBytesPerMonth` | `Part.size` of Plex movies and episodes added in the last 182 days, divided by 6. |
 * | `importListCount` | Records that carry an import-list tag. |
 * | `labelsRead` | Sections where a movie or show row carried `Label` tags. |
 * | `rowBaseline` | `{}`: the reader sets it with `rowBaseline()` (`baseline.ts`). |
 *
 * Users: every plex.tv id of the history, the requests and the access list
 * (P2), and the owner. `hasAccess` is true for an id in the access list or
 * the owner, else false. With no access list (P2 failed) or no owner id, it
 * is null for everyone (E23): a missing owner never reads as "no access".
 *
 * @module lib/cleanup/snapshot/facts
 */

import type { ArrView } from "@/lib/cleanup/identity/arr"
import { isImportListed } from "@/lib/cleanup/identity/arr"
import type { TitleCopy } from "@/lib/cleanup/identity/copies"
import type { ShowStore } from "@/lib/cleanup/identity/episodes"
import { hasExternalId } from "@/lib/cleanup/identity/keys"
import { isInside, normalisePath } from "@/lib/cleanup/identity/path-fence"
import type { SnapshotFacts, SnapshotItem, SnapshotUser } from "@/lib/cleanup/schema/snapshot"
import type { ArrDisk, PlexSection, RadarrMovie, SonarrSeries } from "@/lib/cleanup/schema/upstream"
import type { MovieCopy } from "@/lib/cleanup/snapshot/assemble-movies"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

const NO_IDS_AGENT = "com.plexapp.agents.none"
const GROWTH_DAYS = 182
const DIGITS = /^\d+$/

export interface FactsInput {
  takenAt: string
  sections: readonly PlexSection[]
  movies: readonly MovieCopy[]
  store: ShowStore
  items: Record<Level, readonly SnapshotItem[]>
  radarr: ArrView<RadarrMovie>
  sonarr: ArrView<SonarrSeries>
  history: SnapshotFacts["history"]
  users: SnapshotFacts["users"]
  collections: SnapshotFacts["collections"]
  membersRead: string[]
  labelsRead: string[]
  machineIdentifier: string | null
}

export interface UsersInput {
  /** P2: the plex.tv ids with access. Null when P2 failed. */
  access: readonly string[] | null
  /** `PlexServer.adminPlexUserId`. */
  ownerId: string | null
  /** Per plex.tv id in the history, its newest counted play. Null when Tautulli failed. */
  lastPlays: ReadonlyMap<string, number | null> | null
  requesters: Iterable<string>
}

/** `facts.users` (TS 7.6 Users). Ids that are not digits are left out: they are no plex.tv account. */
export function buildUsers(input: UsersInput): Record<string, SnapshotUser> {
  const owner = input.ownerId !== null && DIGITS.test(input.ownerId) ? input.ownerId : null
  const access = owner !== null && input.access ? new Set(input.access) : null
  const ids = new Set([...(input.access ?? []), ...(owner ? [owner] : []), ...(input.lastPlays?.keys() ?? []), ...input.requesters])
  const users: Record<string, SnapshotUser> = {}
  for (const id of [...ids].filter((v) => DIGITS.test(v)).sort((a, b) => Number(a) - Number(b))) {
    users[id] = { hasAccess: access ? access.has(id) || id === owner : null, lastPlayAt: input.lastPlays?.get(id) ?? null, owner: id === owner }
  }
  return users
}

function library(section: PlexSection, input: FactsInput): SnapshotFacts["libraries"][number] | null {
  if (section.type !== "movie" && section.type !== "show") return null
  const movie = section.type === "movie"
  const copies: readonly TitleCopy[] = movie ? input.movies : [...input.store.shows.values()]
  const roots = movie ? input.radarr.roots : input.sonarr.roots
  const locations = section.Location.map((loc) => loc.path)
  const overlaps = locations.some((loc) => roots.some((root) => isInside(loc, root) || isInside(root, loc)))
  const mine = (item: SnapshotItem) => item.sectionId === section.key && item.match.state === "matched"
  const managed = input.items[movie ? "movie" : "show"].filter(mine)
  return {
    sectionId: section.key, title: section.title, type: section.type, agent: section.agent ?? null, locations,
    arr: overlaps ? (movie ? "radarr" : "sonarr") : null,
    noIds: section.agent === NO_IDS_AGENT || !copies.some((copy) => copy.sectionId === section.key && hasExternalId(copy.ids)),
    items: managed.length,
    seasons: movie ? 0 : input.items.season.filter(mine).length,
    bytes: managed.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0),
  }
}

/** The free and total space of the disks that hold the arr root folders, or null. */
export function diskFacts(views: readonly ArrView<unknown>[]): SnapshotFacts["disk"] {
  const disks = new Map<string, ArrDisk>()
  for (const view of views) {
    if (view.state !== "ok") continue
    for (const root of view.roots) {
      const holding = view.disk.filter((d) => isInside(root, d.path)).sort((a, b) => (normalisePath(b.path) ?? "").length - (normalisePath(a.path) ?? "").length)
      if (holding[0]) disks.set(normalisePath(holding[0].path) ?? holding[0].path, holding[0])
    }
  }
  if (disks.size === 0) return null
  const sum = (pick: (d: ArrDisk) => number) => Math.round([...disks.values()].reduce((total, d) => total + pick(d), 0))
  return { freeBytes: sum((d) => d.freeSpace), totalBytes: sum((d) => d.totalSpace) }
}

/** The bytes a month that Plex added over the last 182 days (TS 7.7). */
export function growthPerMonth(takenAt: string, added: Iterable<{ addedAt: number | null; size: number | null }>): number {
  const since = Math.floor(Date.parse(takenAt) / 1000) - GROWTH_DAYS * 86_400
  let bytes = 0
  for (const row of added) if (row.addedAt !== null && row.addedAt >= since) bytes += row.size ?? 0
  return Math.round(bytes / 6)
}

/**
 * The Plex collection titles of each item (G13): the titles whose members hold
 * one of its copy keys or episode keys. A show also takes its seasons' copy
 * keys, and a season its show's copy keys, so a show protection covers its
 * seasons and a collected season keeps its show.
 *
 * @param members - Per member rating key, the titles of the collections that hold it.
 */
export function collectionTitles(shows: { shows: readonly SnapshotItem[]; seasons: readonly SnapshotItem[] },
  members: ReadonlyMap<string, ReadonlySet<string>>): (item: SnapshotItem) => string[] {
  const copyKeys = (item: SnapshotItem | undefined) => item?.copies.map((copy) => copy.ratingKey) ?? []
  const seasonKeys = new Map<string, string[]>()
  for (const season of shows.seasons) seasonKeys.set(season.showKey ?? "", [...(seasonKeys.get(season.showKey ?? "") ?? []), ...copyKeys(season)])
  const showsByKey = new Map(shows.shows.map((show) => [show.key, show]))
  return (item) => {
    const keys = [...copyKeys(item), ...item.episodeKeys]
    if (item.level === "show") keys.push(...(seasonKeys.get(item.key) ?? []))
    if (item.level === "season") keys.push(...copyKeys(showsByKey.get(item.showKey ?? "")))
    return [...new Set(keys.flatMap((key) => [...(members.get(key) ?? [])]))].sort()
  }
}

/** The facts of one read (TS 7.7). */
export function buildFacts(input: FactsInput): SnapshotFacts {
  const counted = (view: ArrView<{ tags: number[] }>) => view.records.filter((record) => isImportListed(view, record.tags)).length
  return {
    version: 1,
    takenAt: input.takenAt,
    history: input.history,
    users: input.users,
    libraries: input.sections.map((section) => library(section, input)).filter((lib) => lib !== null),
    disk: diskFacts([input.radarr, input.sonarr]),
    growthBytesPerMonth: growthPerMonth(input.takenAt, [...input.movies, ...input.store.episodes.values()]),
    collections: input.collections,
    membersRead: input.membersRead,
    importListCount: { radarr: counted(input.radarr), sonarr: counted(input.sonarr) },
    machineIdentifier: input.machineIdentifier,
    labelsRead: input.labelsRead,
    rowBaseline: {},
  }
}
