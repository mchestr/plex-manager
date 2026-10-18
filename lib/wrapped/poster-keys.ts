/**
 * The poster rating keys a Rewind covers: a viewer's own Rewinds, or the
 * titles the share page shows for a share token (SEC-21).
 *
 * ## Caching
 *
 * Both key sets are cached in process (a viewer's for 10 minutes, a share
 * token's for 5) as pending loads, so the burst of parallel poster requests a
 * slide makes runs one query and one `JSON.parse` per Rewind. Invalid or
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
 * `statistics.topShows[].ratingKey`. Items are read one by one: a malformed
 * item is skipped without emptying the rest of the set.
 *
 * A share token's keys come from the share-safe projection
 * (`./data/share-safe-v2`), which keeps five titles per list, so a share link
 * cannot confirm titles its share page hides. A Rewind the projection cannot
 * read covers no keys.
 *
 * @module
 */

import "server-only"

import { z } from "zod"

import { prisma } from "@/lib/prisma"
import { createLoadingCache } from "@/lib/utils/ttl-cache"
import { toShareSafeV2 } from "@/lib/wrapped/data/share-safe-v2"

const VIEWER_KEYS_TTL_MS = 10 * 60 * 1000
const SHARE_KEYS_TTL_MS = 5 * 60 * 1000
/** A key missing from a set older than this reloads the set once. */
const KEYS_RECHECK_MS = 60 * 1000

interface ViewerPosterKeys {
  plexUserId: string | null
  keys: ReadonlySet<string>
}

const rankedListSchema = z.array(z.unknown()).nullish().catch(null)

const posterKeysSchema = z.object({
  statistics: z
    .object({ topMovies: rankedListSchema, topShows: rankedListSchema })
    .nullish()
    .catch(null),
})

const rankedItemSchema = z.object({
  ratingKey: z.union([z.string().min(1), z.number().int().nonnegative()]).transform(String),
})

const viewerKeysCache = createLoadingCache<string, ViewerPosterKeys>({
  ttlMs: VIEWER_KEYS_TTL_MS,
  maxEntries: 5_000,
})
const shareKeysCache = createLoadingCache<string, ReadonlySet<string> | null>({
  ttlMs: SHARE_KEYS_TTL_MS,
  maxEntries: 5_000,
  keep: (keys) => keys !== null,
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
  return [...(statistics?.topMovies ?? []), ...(statistics?.topShows ?? [])].flatMap((item) => {
    const ranked = rankedItemSchema.safeParse(item)
    return ranked.success ? [ranked.data.ratingKey] : []
  })
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
    select: { year: true, status: true, summary: true, archetype: true, data: true },
  })
  if (!wrapped || wrapped.status !== "completed") return null
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
