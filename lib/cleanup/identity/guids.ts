/**
 * Plex guid parsing (TS 7.4): the external ids of one Plex movie or show.
 *
 * | Input | Result |
 * |---|---|
 * | `Guid[].id` `imdb://tt0111161` | `imdb: "tt0111161"` |
 * | `Guid[].id` `tmdb://278` | `tmdb: 278` |
 * | `Guid[].id` `tvdb://121361` | `tvdb: 121361` |
 * | primary `plex://movie/5d7768...` | `plex: "plex://movie/5d7768..."` |
 * | primary `com.plexapp.agents.imdb://tt0111161?lang=en` | `imdb` |
 * | primary `com.plexapp.agents.themoviedb://278?lang=en` | `tmdb` |
 * | primary `com.plexapp.agents.thetvdb://121361?lang=en` | `tvdb` (shows only) |
 * | primary `com.plexapp.agents.none://...` or `local://...` | nothing |
 * | two different values for one id kind | `conflict: true` |
 *
 * The `Guid` tags come first, then the primary guid, and the first value of
 * a kind stays. A value that is not an id of its kind (`tmdb://abc`,
 * `imdb://278`) is left out. Pure and client-safe.
 *
 * @module lib/cleanup/identity/guids
 */

/** The ids of a Plex item. `plex` is the primary `plex://` guid; the others are external ids. */
export interface PlexIds {
  tmdb?: number
  tvdb?: number
  imdb?: string
  plex?: string
}

export interface ParsedGuids {
  ids: PlexIds
  /** Two different values for one id kind: the item is `conflicted` (`conflictingIds`). */
  conflict: boolean
}

/** The level a guid belongs to. The legacy TheTVDB agent gives an id for shows only. */
export type GuidKind = "movie" | "show"

type ExternalKind = "tmdb" | "tvdb" | "imdb"

const TAG_KINDS: Record<string, ExternalKind> = { imdb: "imdb", tmdb: "tmdb", tvdb: "tvdb" }
const LEGACY_KINDS: Record<string, ExternalKind> = {
  "com.plexapp.agents.imdb": "imdb",
  "com.plexapp.agents.themoviedb": "tmdb",
  "com.plexapp.agents.thetvdb": "tvdb",
}
const IMDB = /^tt\d+$/
const DIGITS = /^\d+$/

/** A guid without the `?lang=...` suffix of the legacy agents (TS 7.6 step 0). */
export function stripLang(guid: string): string {
  const at = guid.indexOf("?lang=")
  return at === -1 ? guid : guid.slice(0, at)
}

/** The scheme (lower case) and the first path segment of `scheme://value/...?query`. */
function splitGuid(guid: string): { scheme: string; value: string } | null {
  const at = guid.indexOf("://")
  if (at <= 0) return null
  const rest = guid.slice(at + 3).split("?")[0]
  return { scheme: guid.slice(0, at).toLowerCase(), value: rest.split("/")[0] }
}

/** The value of an external id of `kind`, or null when it is not one. */
function idValue(kind: ExternalKind, raw: string): number | string | null {
  if (kind === "imdb") {
    const imdb = raw.toLowerCase()
    return IMDB.test(imdb) ? imdb : null
  }
  if (!DIGITS.test(raw)) return null
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

/**
 * The ids of one Plex item from its primary `guid` and its `Guid` tags.
 *
 * @param primary - The row's `guid`, if any.
 * @param tags - The row's `Guid` tags.
 * @param kind - `movie` or `show`: the legacy TheTVDB agent gives `tvdb` for shows only.
 */
export function parsePlexGuids(primary: string | null | undefined, tags: readonly { id: string }[], kind: GuidKind): ParsedGuids {
  const ids: PlexIds = {}
  let conflict = false
  const put = (idKind: ExternalKind, raw: string) => {
    const value = idValue(idKind, raw)
    if (value === null) return
    const known = ids[idKind]
    if (known === undefined) Object.assign(ids, { [idKind]: value })
    else if (known !== value) conflict = true
  }

  for (const tag of tags) {
    const parts = splitGuid(tag.id)
    const idKind = parts ? TAG_KINDS[parts.scheme] : undefined
    if (parts && idKind) put(idKind, parts.value)
  }
  if (primary) {
    const parts = splitGuid(primary)
    if (parts?.scheme === "plex") ids.plex = primary
    const legacy = parts ? LEGACY_KINDS[parts.scheme] : undefined
    if (parts && legacy && (legacy !== "tvdb" || kind === "show")) put(legacy, parts.value)
  }
  return { ids, conflict }
}
