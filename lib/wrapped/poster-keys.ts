/**
 * The poster rating keys a Rewind covers: a viewer's own Rewinds, or the
 * titles the share page shows for a share token (SEC-21).
 *
 * ## Caching
 *
 * Both key sets are cached in process (a viewer's for 10 minutes, a share
 * token's for 5) as pending loads, so the burst of parallel poster requests a
 * slide makes runs one query and one parse per Rewind. Invalid or
 * incomplete share tokens and failed queries are not cached.
 *
 * A key missing from a set loaded more than a minute ago triggers one reload,
 * so a regenerated Rewind's new posters load within a minute instead of
 * waiting out the TTL. Stopping a share link drops that token's set
 * ({@link forgetShareToken}).
 *
 * ## Parsing
 *
 * A viewer's keys come from `statistics.topMovies[].ratingKey` and
 * `statistics.topShows[].ratingKey` of their v1 and v2 Rewinds, read through
 * `parseStoredRewind`, which checks items one by one: a malformed item is
 * skipped without emptying the rest of the set. A v3 row covers the title
 * keys its stored pages hold (`film:<key>`, `series:<key>`: the quiz
 * options, the list rows and the bookends).
 *
 * A share token's keys come from the share-safe projection
 * (`./data/share-safe-v2`), which keeps five titles per list, so a share link
 * cannot confirm titles its share page hides. A Rewind the projection cannot
 * read covers no keys.
 *
 * @module
 */

import "server-only"

import { prisma } from "@/lib/prisma"
import { createLoadingCache } from "@/lib/utils/ttl-cache"
import { parseStoredRewind, readWrappedStatus } from "@/lib/wrapped/data/parse-stored"
import { toShareSafeV2 } from "@/lib/wrapped/data/share-safe-v2"

const VIEWER_KEYS_TTL_MS = 10 * 60 * 1000
const SHARE_KEYS_TTL_MS = 5 * 60 * 1000
/** A key missing from a set older than this reloads the set once. */
const KEYS_RECHECK_MS = 60 * 1000

interface ViewerPosterKeys {
  plexUserId: string | null
  keys: ReadonlySet<string>
}

const viewerKeysCache = createLoadingCache<string, ViewerPosterKeys>({
  ttlMs: VIEWER_KEYS_TTL_MS,
  maxEntries: 5_000,
})
const shareKeysCache = createLoadingCache<string, ReadonlySet<string> | null>({
  ttlMs: SHARE_KEYS_TTL_MS,
  maxEntries: 5_000,
  keep: (keys) => keys !== null,
})

const TITLE_KEY = /^(?:film|series):(\d{1,12})$/

/** Every Plex rating key in a v3 page's data, at any depth. */
function pageKeys(value: unknown): string[] {
  if (typeof value === "string") return TITLE_KEY.exec(value)?.slice(1, 2) ?? []
  if (Array.isArray(value)) return value.flatMap(pageKeys)
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(pageKeys)
  return []
}

/** The poster rating keys stored in one Rewind: v1 and v2 top movies and shows, v3 page data. */
function extractPosterKeys(data: string): string[] {
  const stored = parseStoredRewind(data)
  if (stored.version === 3) return stored.data.pages.flatMap((page) => pageKeys(page.data))
  if (stored.version !== 1 && stored.version !== 2) return []
  const { topMovies, topShows } = stored.legacy.statistics
  return [...topMovies, ...topShows].flatMap((item) => (item.ratingKey ? [item.ratingKey] : []))
}

async function loadViewerPosterKeys(userId: string): Promise<ViewerPosterKeys> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plexUserId: true, plexWrapped: { select: { data: true } } },
  })
  return {
    plexUserId: user?.plexUserId ?? null,
    keys: new Set((user?.plexWrapped ?? []).flatMap((row) => extractPosterKeys(row.data))),
  }
}

/** The poster rating keys the share page of one Rewind shows. */
function extractSharePosterKeys(row: Parameters<typeof toShareSafeV2>[0]): string[] {
  try {
    const { topMovies, topShows } = toShareSafeV2(row, { name: null })
    return [...topMovies, ...topShows].flatMap((title) => (title.ratingKey ? [title.ratingKey] : []))
  } catch {
    return []
  }
}

async function loadShareKeys(token: string): Promise<ReadonlySet<string> | null> {
  const wrapped = await prisma.plexWrapped.findUnique({
    where: { shareToken: token },
    select: { id: true, year: true, status: true, summary: true, archetype: true, data: true },
  })
  if (!wrapped || readWrappedStatus(wrapped.status, wrapped.id) !== "completed") return null
  return new Set(extractSharePosterKeys(wrapped))
}

/**
 * The viewer's Plex account ID and the poster keys of their own Rewinds,
 * reloaded once when `ratingKey` is missing from a set older than a minute.
 */
export async function getViewerPosterKeys(
  userId: string,
  ratingKey: string
): Promise<ViewerPosterKeys> {
  const load = () => loadViewerPosterKeys(userId)
  const viewer = await viewerKeysCache.get(userId, load)
  if (viewer.keys.has(ratingKey)) return viewer
  return viewerKeysCache.get(userId, load, { maxAgeMs: KEYS_RECHECK_MS })
}

/**
 * Whether a share token belongs to a completed Rewind whose share page shows
 * the rating key among its top movies or shows.
 */
export async function shareTokenAllowsRatingKey(
  token: string,
  ratingKey: string
): Promise<boolean> {
  const load = () => loadShareKeys(token)
  const keys = await shareKeysCache.get(token, load)
  if (!keys) return false
  if (keys.has(ratingKey)) return true
  const reloaded = await shareKeysCache.get(token, load, { maxAgeMs: KEYS_RECHECK_MS })
  return reloaded?.has(ratingKey) ?? false
}

/**
 * Drops a share token's cached key set, so a stopped link stops serving
 * posters from this process at once instead of after the 5-minute TTL.
 */
export function forgetShareToken(token: string): void {
  shareKeysCache.delete(token)
}

/** Drops both key caches. For tests. */
export function clearPosterKeyCaches(): void {
  viewerKeysCache.clear()
  shareKeysCache.clear()
}
