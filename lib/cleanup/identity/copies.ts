/**
 * What every Plex copy of one title shares, and how the copies merge into one
 * item (TS 7.4 Copies, 7.5). Pure and client-safe.
 *
 * - A copy is one Plex movie or show row with its section, title key and ids.
 * - The copies of one title are the copies that share a TMDB, TVDB or IMDb
 *   id, also through a third copy (`groupCopies`). A 4K copy on a legacy
 *   agent with only an IMDb id joins the 1080p copy with TMDB and IMDb ids,
 *   so its plays and Keep forever marks count for the one item.
 * - The item's ids are the union of the copies' ids, and its title key comes
 *   from them. Two copies with two values for one id kind make the item
 *   `conflicted` (`conflictingIds`).
 * - Labels are the union of every copy's `Label[].tag` values, in lower case
 *   (integrations-r3-3): a share filter applies to each copy's section, so
 *   the union hides more and never less.
 * - Plex and arr numbers become whole, non-negative values or null, so every
 *   item passes `snapshotItemSchema`.
 *
 * @module lib/cleanup/identity/copies
 */

import { type GuidKind, type PlexIds, parsePlexGuids } from "@/lib/cleanup/identity/guids"
import { titleKey } from "@/lib/cleanup/identity/keys"

/** One Plex movie or show row, reduced to what the assembly reads. */
export interface TitleCopy {
  ratingKey: string
  sectionId: string
  titleKey: string
  title: string
  year: number | null
  addedAt: number | null
  /** The primary guid, for the history match by guid. */
  guid: string | null
  ids: PlexIds
  conflict: boolean
  /** `Label[].tag` values in lower case, without empty ones. */
  labels: string[]
}

/** What a Plex movie or show row holds for a copy. */
export interface TitleRow {
  ratingKey: string
  title: string
  year?: number
  addedAt?: number
  guid?: string
  Guid: { id: string }[]
  Label: { tag: string }[]
}

/** A whole, non-negative number, or null. */
export function wholeOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return null
  return Math.round(value)
}

/** Unix seconds of an ISO time, or null when it does not parse or is before 1970. */
export function epochOf(iso: string | null | undefined): number | null {
  const ms = iso ? Date.parse(iso) : Number.NaN
  return Number.isFinite(ms) && ms >= 0 ? Math.floor(ms / 1000) : null
}

/** The sum of the known sizes, or null when none is known. */
export function sumSizes(sizes: readonly (number | null | undefined)[]): number | null {
  let total: number | null = null
  for (const size of sizes) {
    const whole = wholeOrNull(size)
    if (whole !== null) total = (total ?? 0) + whole
  }
  return total
}

/** The newest of the known times, or null. */
export function newest(times: readonly (number | null)[]): number | null {
  return times.reduce<number | null>((max, t) => (t !== null && (max === null || t > max) ? t : max), null)
}

/** One copy of a Plex movie or show row of `sectionId`. */
export function toTitleCopy(sectionId: string, row: TitleRow, kind: GuidKind): TitleCopy {
  const { ids, conflict } = parsePlexGuids(row.guid, row.Guid, kind)
  const year = wholeOrNull(row.year)
  return {
    ratingKey: row.ratingKey,
    sectionId,
    titleKey: titleKey(kind, ids, row.ratingKey),
    title: row.title,
    year: year !== null && Number.isInteger(row.year) ? year : null,
    addedAt: wholeOrNull(row.addedAt),
    guid: row.guid ?? null,
    ids,
    conflict,
    labels: row.Label.map((label) => label.tag.trim().toLowerCase()).filter((tag) => tag !== ""),
  }
}

/** The ids of every copy, and whether two copies disagree on one id kind. */
export function mergeIds(copies: readonly Pick<TitleCopy, "ids" | "conflict">[]): { ids: PlexIds; conflict: boolean } {
  const ids: PlexIds = {}
  let conflict = false
  for (const copy of copies) {
    conflict ||= copy.conflict
    for (const kind of ["tmdb", "tvdb", "imdb", "plex"] as const) {
      const value = copy.ids[kind]
      if (value === undefined) continue
      if (ids[kind] === undefined) Object.assign(ids, { [kind]: value })
      else if (ids[kind] !== value && kind !== "plex") conflict = true
    }
  }
  return { ids, conflict }
}

/** The union of the copies' labels, sorted. */
export function unionLabels(copies: readonly TitleCopy[]): string[] {
  return [...new Set(copies.flatMap((copy) => copy.labels))].sort()
}

/** The id kinds that join two copies into one title. A `plex://` guid alone joins nothing, as it makes no title key. */
const JOIN_KINDS = ["tmdb", "tvdb", "imdb"] as const

type GroupedCopy = Pick<TitleCopy, "ratingKey" | "ids" | "conflict">

/**
 * The copies grouped into titles: copies that share an id of
 * {@link JOIN_KINDS}, directly or through other copies, form one group. Each
 * group is keyed by the title key of its merged ids (`mergeIds`), so a copy
 * with only an IMDb id joins the copy that also has the TMDB id under
 * `tmdb:`. Groups and their copies keep the first-seen order.
 */
export function groupCopies<C extends GroupedCopy>(copies: Iterable<C>, level: GuidKind): Map<string, C[]> {
  const list = [...copies]
  const root = list.map((_, i) => i)
  const find = (i: number): number => {
    let at = i
    while (root[at] !== at) {
      root[at] = root[root[at]]
      at = root[at]
    }
    return at
  }
  const firstOf = new Map<string, number>()
  list.forEach((copy, i) => {
    for (const kind of JOIN_KINDS) {
      const value = copy.ids[kind]
      if (value === undefined) continue
      const id = `${kind}:${String(value).toLowerCase()}`
      const first = firstOf.get(id)
      if (first === undefined) firstOf.set(id, i)
      else {
        const [a, b] = [find(i), find(first)]
        // The smaller index stays the root, so a group's root is its first copy
        if (a !== b) root[Math.max(a, b)] = Math.min(a, b)
      }
    }
  })
  const members = new Map<number, C[]>()
  list.forEach((copy, i) => members.set(find(i), [...(members.get(find(i)) ?? []), copy]))
  const groups = new Map<string, C[]>()
  for (const group of members.values()) groups.set(titleKey(level, mergeIds(group).ids, group[0].ratingKey), group)
  return groups
}

/** The title key of each copy's group (`groupCopies`), by rating key. */
export function titleKeysOf(copies: Iterable<GroupedCopy>, level: GuidKind): Map<string, string> {
  const keys = new Map<string, string>()
  for (const [key, group] of groupCopies(copies, level)) for (const copy of group) keys.set(copy.ratingKey, key)
  return keys
}
