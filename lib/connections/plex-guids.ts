/**
 * The TMDB, TVDB and IMDb ids Plex holds for an item.
 *
 * ## Sources
 *
 * - **Current agents** (`plex://movie/…`, `plex://show/…`) put the ids in the
 *   item's `Guid` tags, which `GET /library/metadata/{ratingKey}?includeGuids=1`
 *   returns: `imdb://tt0137523`, `tmdb://550`, `tvdb://194`.
 * - **Legacy agents** carry one id in the `guid` attribute itself:
 *
 *   | Agent                    | `guid`                                          |
 *   |--------------------------|-------------------------------------------------|
 *   | Plex Movie (legacy)      | `com.plexapp.agents.imdb://tt0137523?lang=en`   |
 *   | The Movie Database       | `com.plexapp.agents.themoviedb://550?lang=en`   |
 *   | TheTVDB (and DVD order)  | `com.plexapp.agents.thetvdb://73244/1/1?lang=en`|
 *
 * A tag wins over the legacy `guid` when both name the same source. Anything
 * else (`local://`, `com.plexapp.agents.none://`, an id that isn't a positive
 * number or an IMDb `tt` id) yields no id, so a lookup by these ids finds
 * nothing rather than the wrong title.
 *
 * @module
 */

/** External ids of a movie, show or episode, as Plex holds them. */
export interface PlexExternalIds {
  tmdb?: number
  tvdb?: number
  imdb?: string
}

type Source = keyof PlexExternalIds

const TAG = /^(imdb|tmdb|tvdb):\/\/([^?/]+)$/
const LEGACY = /^com\.plexapp\.agents\.(imdb|themoviedb|thetvdb|thetvdbdvdorder):\/\/([^?/]+)/
const LEGACY_SOURCES: Record<string, Source> = {
  imdb: "imdb",
  themoviedb: "tmdb",
  thetvdb: "tvdb",
  thetvdbdvdorder: "tvdb",
}
const NUMERIC_ID = /^[1-9]\d{0,9}$/
const IMDB_ID = /^tt\d{1,10}$/

function setId(ids: PlexExternalIds, source: Source, value: string): void {
  if (ids[source] !== undefined) return
  if (source === "imdb") {
    if (IMDB_ID.test(value)) ids.imdb = value
  } else if (NUMERIC_ID.test(value)) {
    ids[source] = Number(value)
  }
}

/**
 * Reads the external ids from an item's `Guid` tags and legacy `guid`.
 *
 * @param guid - The item's `guid` attribute
 * @param guidTags - The `id` of each of its `Guid` tags
 *
 * @example
 * ```ts
 * parsePlexExternalIds("plex://movie/5d77…", ["imdb://tt0137523", "tmdb://550"])
 * // { imdb: "tt0137523", tmdb: 550 }
 * parsePlexExternalIds("com.plexapp.agents.thetvdb://73244/1/1?lang=en", [])
 * // { tvdb: 73244 }
 * ```
 */
export function parsePlexExternalIds(guid: string | undefined, guidTags: readonly string[]): PlexExternalIds {
  const ids: PlexExternalIds = {}
  for (const tag of guidTags) {
    const match = TAG.exec(tag)
    if (match) setId(ids, match[1] as Source, match[2])
  }
  const legacy = guid ? LEGACY.exec(guid) : null
  if (legacy) setId(ids, LEGACY_SOURCES[legacy[1]], legacy[2])
  return ids
}
