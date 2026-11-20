/**
 * One Plex item's metadata: its external ids, library section, files and
 * folders.
 *
 * ## Overview
 *
 * {@link getPlexItemMetadata} reads `GET <url>/library/metadata/<ratingKey>?includeGuids=1`
 * with the owner token. `includeGuids=1` adds the `Guid` tags that hold the
 * TMDB, TVDB and IMDb ids of the current Plex agents; legacy agents carry
 * theirs in `guid` (`./plex-guids`). The same read answers the library
 * section lookup behind the SEC-21 access check (`getItemSectionKey`), so a
 * caller that needs both makes one request.
 *
 * ## Failures
 *
 * Never thrown. A rating key that isn't digits (`../1`, `1/children`) is
 * `missing` without a request, a Plex 404 is `missing`, and anything else
 * (timeout, network error, other status, unexpected shape) is `unknown`, so
 * an access check denies. `timeoutMs` (default 3 s) covers the body too.
 *
 * @module
 */

import "server-only"

import { z } from "zod"

import { serviceFetch } from "@/lib/connections/http"
import { ratingKeySchema } from "@/lib/validations/params"

import { parsePlexExternalIds, type PlexExternalIds } from "./plex-guids"

const LOOKUP_TIMEOUT_MS = 3000

const keySchema = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).transform(String)
const optionalKey = keySchema.optional().catch(undefined)

const partSchema = z.looseObject({ file: z.string(), size: z.number().optional().catch(undefined) })

const itemSchema = z.looseObject({
  ratingKey: keySchema,
  type: z.string(),
  title: z.string(),
  year: z.number().int().optional().catch(undefined),
  guid: z.string().optional().catch(undefined),
  librarySectionID: optionalKey,
  grandparentRatingKey: optionalKey,
  grandparentTitle: z.string().optional().catch(undefined),
  parentIndex: z.number().int().optional().catch(undefined),
  index: z.number().int().optional().catch(undefined),
  Guid: z.array(z.looseObject({ id: z.string() })).optional().catch(undefined),
  Media: z.array(z.looseObject({ Part: z.array(partSchema).optional().catch(undefined) })).optional().catch(undefined),
  Location: z.array(z.looseObject({ path: z.string() })).optional().catch(undefined),
})

const responseSchema = z.looseObject({
  MediaContainer: z.looseObject({
    librarySectionID: optionalKey,
    Metadata: z.array(itemSchema).min(1),
  }),
})

/** What the server holds for one item. */
export interface PlexItemMetadata {
  ratingKey: string
  /** `movie`, `show`, `season`, `episode`, … */
  type: string
  title: string
  year?: number
  /** The agent's guid: `plex://movie/…`, or a legacy agent's. */
  guid?: string
  ids: PlexExternalIds
  /** `librarySectionID` as a string, like the share list's section keys. */
  librarySectionId?: string
  /** An episode's show, its title, and the episode's season and number. */
  grandparentRatingKey?: string
  showTitle?: string
  seasonNumber?: number
  episodeNumber?: number
  /** Every file of every version, as the server sees it. */
  parts: { file: string; size?: number }[]
  /** A show's folders. */
  locations: string[]
}

/** `missing` when there is no such item, `unknown` when the server couldn't be read. */
export type PlexItemLookup =
  | { status: "found"; item: PlexItemMetadata }
  | { status: "missing" }
  | { status: "unknown" }

/**
 * Reads one item's metadata.
 *
 * @param server - The active Plex server (URL and owner token)
 * @param ratingKey - The item's rating key; anything but digits is `missing`
 */
export async function getPlexItemMetadata(
  server: { url: string; token: string },
  ratingKey: string,
  { timeoutMs = LOOKUP_TIMEOUT_MS }: { timeoutMs?: number } = {}
): Promise<PlexItemLookup> {
  if (!ratingKeySchema.safeParse(ratingKey).success) return { status: "missing" }

  const result = await serviceFetch({
    service: "Plex",
    url: `${server.url}/library/metadata/${encodeURIComponent(ratingKey)}?includeGuids=1`,
    headers: { "X-Plex-Token": server.token },
    schema: responseSchema,
    timeoutMs,
  })
  if (!result.ok) return result.code === "HTTP" && result.status === 404 ? { status: "missing" } : { status: "unknown" }

  const container = result.data.MediaContainer
  const item = container.Metadata[0]
  return {
    status: "found",
    item: {
      ratingKey: item.ratingKey,
      type: item.type,
      title: item.title,
      year: item.year,
      guid: item.guid,
      ids: parsePlexExternalIds(item.guid, item.Guid?.map((tag) => tag.id) ?? []),
      librarySectionId: item.librarySectionID ?? container.librarySectionID,
      grandparentRatingKey: item.grandparentRatingKey,
      showTitle: item.grandparentTitle,
      seasonNumber: item.parentIndex,
      episodeNumber: item.index,
      parts: (item.Media ?? []).flatMap((media) => media.Part ?? []).map(({ file, size }) => ({ file, size })),
      locations: (item.Location ?? []).map((location) => location.path),
    },
  }
}
