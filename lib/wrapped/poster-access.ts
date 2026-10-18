/**
 * Who may fetch which poster through `/api/wrapped/poster/[ratingKey]`
 * (SEC-21), plus the route's negative cache.
 *
 * ## Session access
 *
 * A signed-in viewer may fetch a rating key when the first of these holds:
 *
 * 1. The viewer is an admin, or is the server owner
 *    (`user.plexUserId === plexServer.adminPlexUserId`).
 * 2. The key is among the `topMovies`/`topShows` of the viewer's own
 *    `PlexWrapped` rows. One query loads the viewer's Plex ID and rows; the
 *    key set is cached per user for 10 minutes. This answers every request
 *    the Rewind viewer makes without contacting Plex.
 * 3. The request carries a share token that covers the key (a member viewing
 *    someone else's shared Rewind). The response is then a share response.
 * 4. The item's library section is shared with the viewer's Plex account
 *    (`lib/connections/plex-shared-sections.ts`). If plex.tv or the server
 *    cannot be read, this check denies.
 *
 * Anything else is denied; the route answers 404 so it is not an existence
 * oracle.
 *
 * ## Share access
 *
 * A share token covers the keys of its completed Rewind. Each token's key set
 * is cached for 5 minutes, so a share view parses the stored JSON once rather
 * than once per poster.
 *
 * ## Negative cache
 *
 * Rating keys whose poster Plex could not produce (404, timeout, network
 * error) are remembered for 5 minutes, so repeat misses are answered without
 * contacting Plex.
 *
 * @module
 */

import "server-only"

import { z } from "zod"

import {
  getItemSectionKey,
  getSharedSectionKeys,
} from "@/lib/connections/plex-shared-sections"
import { prisma } from "@/lib/prisma"
import { createTtlCache } from "@/lib/utils/ttl-cache"

const VIEWER_KEYS_TTL_MS = 10 * 60 * 1000
const SHARE_KEYS_TTL_MS = 5 * 60 * 1000
const MISS_TTL_MS = 5 * 60 * 1000

/** How the route may serve a poster to a session: privately, as a share, or not at all. */
export type SessionPosterAccess = "private" | "share" | "deny"

interface PosterViewer {
  id: string
  isAdmin: boolean
}

interface PosterServer {
  url: string
  token: string
  adminPlexUserId: string | null
}

interface ViewerPosterKeys {
  plexUserId: string | null
  keys: ReadonlySet<string>
}

const rankedItemsSchema = z
  .array(z.object({ ratingKey: z.string().nullish() }))
  .nullish()

const posterKeysSchema = z.object({
  statistics: z
    .object({ topMovies: rankedItemsSchema, topShows: rankedItemsSchema })
    .nullish(),
})

const viewerKeysCache = createTtlCache<string, ViewerPosterKeys>({
  ttlMs: VIEWER_KEYS_TTL_MS,
  maxEntries: 5_000,
})
const shareKeysCache = createTtlCache<string, ReadonlySet<string>>({
  ttlMs: SHARE_KEYS_TTL_MS,
  maxEntries: 5_000,
})
const missCache = createTtlCache<string, true>({
  ttlMs: MISS_TTL_MS,
  maxEntries: 10_000,
})

/** The poster rating keys (top movies and shows) stored in one Rewind's JSON. */
function extractPosterKeys(data: string): string[] {
  let json: unknown
  try {
    json = JSON.parse(data)
  } catch {
    return []
  }
  const parsed = posterKeysSchema.safeParse(json)
  if (!parsed.success) return []
  const statistics = parsed.data.statistics
  return [...(statistics?.topMovies ?? []), ...(statistics?.topShows ?? [])].flatMap((item) =>
    item.ratingKey ? [item.ratingKey] : []
  )
}

async function getViewerPosterKeys(userId: string): Promise<ViewerPosterKeys> {
  const cached = viewerKeysCache.get(userId)
  if (cached) return cached

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plexUserId: true, plexWrapped: { select: { data: true } } },
  })
  const entry: ViewerPosterKeys = {
    plexUserId: user?.plexUserId ?? null,
    keys: new Set((user?.plexWrapped ?? []).flatMap((row) => extractPosterKeys(row.data))),
  }
  viewerKeysCache.set(userId, entry)
  return entry
}

async function isInSharedSection(
  server: PosterServer,
  plexUserId: string,
  ratingKey: string
): Promise<boolean> {
  const sections = await getSharedSectionKeys(server, plexUserId)
  if (sections === null) return false
  if (sections === "all") return true
  if (sections.size === 0) return false
  const sectionKey = await getItemSectionKey(server, ratingKey)
  return sectionKey !== null && sections.has(sectionKey)
}

/**
 * Whether a share token belongs to a completed Rewind whose top movies or
 * shows include the rating key.
 */
export async function shareTokenAllowsRatingKey(
  token: string,
  ratingKey: string
): Promise<boolean> {
  let keys = shareKeysCache.get(token)
  if (!keys) {
    const wrapped = await prisma.plexWrapped.findUnique({
      where: { shareToken: token },
      select: { status: true, data: true },
    })
    if (!wrapped || wrapped.status !== "completed") return false
    keys = new Set(extractPosterKeys(wrapped.data))
    shareKeysCache.set(token, keys)
  }
  return keys.has(ratingKey)
}

/**
 * Decides whether a signed-in viewer may fetch a poster (see the module doc
 * for the order of checks).
 *
 * @param viewer - The session user
 * @param server - The active Plex server
 * @param ratingKey - The requested rating key (already validated)
 * @param shareToken - The `share` query parameter, if any
 */
export async function resolveSessionPosterAccess(
  viewer: PosterViewer,
  server: PosterServer,
  ratingKey: string,
  shareToken: string | null
): Promise<SessionPosterAccess> {
  if (viewer.isAdmin) return "private"

  const { plexUserId, keys } = await getViewerPosterKeys(viewer.id)
  if (plexUserId && plexUserId === server.adminPlexUserId) return "private"
  if (keys.has(ratingKey)) return "private"
  if (shareToken && (await shareTokenAllowsRatingKey(shareToken, ratingKey))) return "share"
  if (plexUserId && (await isInSharedSection(server, plexUserId, ratingKey))) return "private"
  return "deny"
}

/** Whether Plex recently failed to produce this poster. */
export function isKnownPosterMiss(ratingKey: string): boolean {
  return missCache.get(ratingKey) === true
}

/** Remembers that Plex could not produce this poster. */
export function rememberPosterMiss(ratingKey: string): void {
  missCache.set(ratingKey, true)
}

/** Drops every cache in this module. For tests. */
export function clearPosterAccessCaches(): void {
  viewerKeysCache.clear()
  shareKeysCache.clear()
  missCache.clear()
}
