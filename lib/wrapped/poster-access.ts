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
 * 2. The key is among the poster keys of the viewer's own Rewinds
 *    (`./poster-keys`). This answers every request the Rewind viewer makes
 *    without contacting Plex.
 * 3. The request carries a share token that covers the key (a member viewing
 *    someone else's shared Rewind). The response is then a share response.
 * 4. The item's library section is shared with the viewer's Plex account
 *    (`lib/connections/plex-shared-sections.ts`). These lookups get what is
 *    left of the request's deadline; if plex.tv or the server cannot be read
 *    in time, this check denies.
 *
 * Anything else is denied; the route answers 404 so it is not an existence
 * oracle. A denial never enters the negative cache, which every viewer shares.
 *
 * ## Negative cache
 *
 * Rating keys whose poster Plex could not produce, or that the server says
 * do not exist, are remembered for 5 minutes, so repeat misses are answered
 * without contacting Plex.
 *
 * @module
 */

import "server-only"

import { getItemSectionKey, getSharedSectionKeys } from "@/lib/connections/plex-shared-sections"
import { createTtlCache } from "@/lib/utils/ttl-cache"

import { clearPosterKeyCaches, getViewerPosterKeys, shareTokenAllowsRatingKey } from "./poster-keys"

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

interface AccessOptions {
  /** The `share` query parameter, if any. */
  shareToken: string | null
  /** Epoch ms by which every upstream call of the request must be done. */
  deadline: number
}

const missCache = createTtlCache<string, true>({
  ttlMs: MISS_TTL_MS,
  maxEntries: 10_000,
})

/** Milliseconds left before a deadline (0 once it has passed). */
export function remainingMs(deadline: number): number {
  return Math.max(0, deadline - Date.now())
}

async function isInSharedSection(
  server: PosterServer,
  plexUserId: string,
  ratingKey: string,
  deadline: number
): Promise<boolean> {
  // With no time left, the poster could not be fetched anyway; starting a
  // share-list load now would only hand concurrent requests a doomed one
  const listTimeoutMs = remainingMs(deadline)
  if (listTimeoutMs === 0) return false
  const sections = await getSharedSectionKeys(server, plexUserId, { timeoutMs: listTimeoutMs })
  if (sections === null) return false
  if (sections === "all") return true
  if (sections.size === 0) return false

  const timeoutMs = remainingMs(deadline)
  if (timeoutMs === 0) return false
  const item = await getItemSectionKey(server, ratingKey, { timeoutMs })
  // The server has no such item, whoever asks: every viewer may skip it
  if (item.status === "missing") rememberPosterMiss(ratingKey)
  return item.status === "found" && sections.has(item.sectionKey)
}

/**
 * Decides whether a signed-in viewer may fetch a poster (see the module doc
 * for the order of checks).
 *
 * @param viewer - The session user
 * @param server - The active Plex server
 * @param ratingKey - The requested rating key (already validated)
 * @param options - The share token and the request's upstream deadline
 */
export async function resolveSessionPosterAccess(
  viewer: PosterViewer,
  server: PosterServer,
  ratingKey: string,
  { shareToken, deadline }: AccessOptions
): Promise<SessionPosterAccess> {
  if (viewer.isAdmin) return "private"

  const { plexUserId, keys } = await getViewerPosterKeys(viewer.id, ratingKey)
  if (plexUserId && plexUserId === server.adminPlexUserId) return "private"
  if (keys.has(ratingKey)) return "private"
  if (shareToken && (await shareTokenAllowsRatingKey(shareToken, ratingKey))) return "share"
  if (plexUserId && (await isInSharedSection(server, plexUserId, ratingKey, deadline))) {
    return "private"
  }
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

/** Drops every cache behind the poster route. For tests. */
export function clearPosterAccessCaches(): void {
  clearPosterKeyCaches()
  missCache.clear()
}
