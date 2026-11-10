/**
 * Which library sections a Plex server shares with a member, and which
 * section an item belongs to.
 *
 * ## Overview
 *
 * The poster proxy uses these two lookups to let a member fetch artwork only
 * from libraries the owner shares with them (SEC-21):
 *
 * 1. {@link getSharedSectionKeys} reads the owner's share list from plex.tv
 *    (`GET https://plex.tv/api/servers/<machineIdentifier>/shared_servers`,
 *    owner token; parsed by `./plex-shared-servers-xml`). The host comes from
 *    `plexTvBaseUrl()`, the E2E seam.
 * 2. {@link getItemSectionKey} asks the Plex server for an item's metadata
 *    (`GET <url>/library/metadata/<ratingKey>`).
 *
 * {@link getSharedSectionFilters} reads the same share list, with the filter
 * text of each section, for media cleanup's member pages.
 *
 * Responses are validated with Zod. Failures (timeout, network error,
 * unexpected status or shape) are reported, never thrown, so callers deny
 * access when plex.tv or the server cannot be read. Each call takes a
 * `timeoutMs` (default 3 s): how long it waits for the answer, body included.
 *
 * ## Caching
 *
 * - The share list is cached per server for 10 minutes. Concurrent callers
 *   share one plex.tv load with a fixed 3 s budget. Each caller waits only
 *   for its own timeout.
 * - An item's section key is cached for 24 hours.
 * - Failures are not cached, so a recovered plex.tv is used on the next call.
 *
 * @module
 */

import "server-only"

import { z } from "zod"

import { plexTvBaseUrl } from "@/lib/security/test-mode"
import { fetchWithTimeout } from "@/lib/utils/fetch-with-timeout"
import { createLoadingCache, createTtlCache } from "@/lib/utils/ttl-cache"

import { getPlexServerIdentity } from "./plex-connection"
import { getClientIdentifier, logger } from "./plex-core"
import { filtersOf, keysOf, parseSharedServersDocument, type SharedSectionFilters, type SharedSectionKeys } from "./plex-shared-servers-xml"

export type { SharedSectionFilters, SharedSectionKeys } from "./plex-shared-servers-xml"

const LOOKUP_TIMEOUT_MS = 3000
const SHARED_SERVERS_TTL_MS = 10 * 60 * 1000
const ITEM_SECTION_TTL_MS = 24 * 60 * 60 * 1000

interface PlexServerConfig {
  url: string
  token: string
  /** The owner's Plex account ID, who is never in the share list. */
  adminPlexUserId?: string | null
}

interface LookupOptions {
  /** How long this caller waits for the answer (default 3000 ms). */
  timeoutMs?: number
}

/**
 * What the server says about an item's library section: `missing` when it
 * answered 404 (there is no such item), `unknown` when it could not be read
 * or answered something unexpected.
 */
export type ItemSectionLookup =
  | { status: "found"; sectionKey: string }
  | { status: "missing" }
  | { status: "unknown" }

const sectionIdSchema = z.object({
  librarySectionID: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).transform(String),
})

const itemMetadataSchema = z.object({
  MediaContainer: z.object({ Metadata: z.array(z.unknown()).optional() }).loose(),
})

/** One parse of the share list, read by both lookups (13.1 rule 2). */
interface SharedServers {
  keys: ReadonlyMap<string, SharedSectionKeys>
  filters: ReadonlyMap<string, SharedSectionFilters>
}

const sharedServersCache = createLoadingCache<string, SharedServers | null>({
  ttlMs: SHARED_SERVERS_TTL_MS,
  maxEntries: 8,
  keep: (loaded) => loaded !== null,
})
const itemSectionCache = createTtlCache<string, string>({ ttlMs: ITEM_SECTION_TTL_MS, maxEntries: 10_000 })

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** The share list, in at most {@link LOOKUP_TIMEOUT_MS} whatever any caller waits. */
async function loadSharedServers(server: PlexServerConfig): Promise<SharedServers | null> {
  const deadline = Date.now() + LOOKUP_TIMEOUT_MS
  try {
    const identity = await getPlexServerIdentity(server, { timeoutMs: LOOKUP_TIMEOUT_MS })
    if (!identity.success || !identity.machineIdentifier) {
      logger.warn("Shared sections: could not read the server's machine identifier", { error: identity.error })
      return null
    }

    const url = `${plexTvBaseUrl().plexTv}/api/servers/${encodeURIComponent(identity.machineIdentifier)}/shared_servers`
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        Accept: "application/xml",
        "X-Plex-Token": server.token,
        "X-Plex-Client-Identifier": getClientIdentifier(),
      },
      timeoutMs: Math.max(0, deadline - Date.now()),
      timeoutCoversBody: true,
    })
    if (!response.ok) {
      logger.warn("Shared sections: plex.tv request failed", { status: response.status })
      return null
    }

    const document = parseSharedServersDocument(await response.text())
    if (!document) {
      logger.warn("Shared sections: unexpected plex.tv response shape")
      return null
    }
    return { keys: keysOf(document), filters: filtersOf(document) }
  } catch (error) {
    logger.warn("Shared sections: plex.tv lookup failed", { error: errorMessage(error) })
    return null
  }
}

/**
 * The shared load (E29), or `null` once `timeoutMs` has passed. A caller that
 * stops waiting leaves the load running, and it fills the cache.
 */
async function sharedServers(server: PlexServerConfig, timeoutMs: number): Promise<SharedServers | null> {
  const load = sharedServersCache.get(server.url, () => loadSharedServers(server))
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(resolve, timeoutMs, null)
  })
  try {
    return await Promise.race([load, late])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The library section keys the server shares with a Plex user.
 *
 * Returns `'all'` for the server owner. Admins of this app who are not the
 * owner are not known here: callers that grant admins everything check that
 * themselves.
 *
 * @param server - The active Plex server (URL, owner token, owner's Plex ID)
 * @param plexUserId - The member's Plex account ID
 * @returns `'all'` for the owner or a share covering every unfiltered
 *   library, the set of shared local section keys (empty when the user has no
 *   share), or `null` when plex.tv could not be read
 */
export async function getSharedSectionKeys(
  server: PlexServerConfig,
  plexUserId: string,
  { timeoutMs = LOOKUP_TIMEOUT_MS }: LookupOptions = {}
): Promise<SharedSectionKeys | null> {
  if (server.adminPlexUserId && plexUserId === server.adminPlexUserId) return "all"
  const loaded = await sharedServers(server, timeoutMs)
  if (!loaded) return null
  return loaded.keys.get(plexUserId) ?? new Set<string>()
}

/**
 * The sections the server shares with a Plex user, each with its filter text
 * (`null` for none), from the same cached load as {@link getSharedSectionKeys}.
 * Unlike that lookup, a filtered section stays (`filtersOf`).
 *
 * @param server - The active Plex server (URL, owner token, owner's Plex ID)
 * @param plexUserId - The member's Plex account ID
 * @returns `'all'` for the owner or a share of every library with no filter,
 *   the section map (empty when the user has no share), or `null` when
 *   plex.tv could not be read in `timeoutMs`
 */
export async function getSharedSectionFilters(
  server: PlexServerConfig,
  plexUserId: string,
  { timeoutMs = LOOKUP_TIMEOUT_MS }: LookupOptions = {}
): Promise<SharedSectionFilters | null> {
  if (server.adminPlexUserId && plexUserId === server.adminPlexUserId) return "all"
  const loaded = await sharedServers(server, timeoutMs)
  if (!loaded) return null
  return loaded.filters.get(plexUserId) ?? new Map<string, string | null>()
}

/** Reads `MediaContainer.librarySectionID`, falling back to the first item's. */
function readSectionKey(body: unknown): string | null {
  const parsed = itemMetadataSchema.safeParse(body)
  if (!parsed.success) return null
  const container = parsed.data.MediaContainer
  for (const candidate of [container, container.Metadata?.[0]]) {
    const section = sectionIdSchema.safeParse(candidate)
    if (section.success) return section.data.librarySectionID
  }
  return null
}

/**
 * The library section key (`librarySectionID`) of a Plex item.
 *
 * @param server - The active Plex server (URL and owner token)
 * @param ratingKey - The item's rating key (digits only; the caller validates it)
 */
export async function getItemSectionKey(
  server: PlexServerConfig,
  ratingKey: string,
  { timeoutMs = LOOKUP_TIMEOUT_MS }: LookupOptions = {}
): Promise<ItemSectionLookup> {
  const cacheKey = `${server.url}|${ratingKey}`
  const cached = itemSectionCache.get(cacheKey)
  if (cached) return { status: "found", sectionKey: cached }

  try {
    const response = await fetchWithTimeout(`${server.url}/library/metadata/${ratingKey}`, {
      method: "GET",
      headers: { Accept: "application/json", "X-Plex-Token": server.token },
      timeoutMs,
      timeoutCoversBody: true,
    })
    if (response.status === 404) return { status: "missing" }
    if (!response.ok) return { status: "unknown" }

    const sectionKey = readSectionKey(await response.json())
    if (sectionKey === null) return { status: "unknown" }

    itemSectionCache.set(cacheKey, sectionKey)
    return { status: "found", sectionKey }
  } catch (error) {
    logger.debug("Item section lookup failed", { ratingKey, error: errorMessage(error) })
    return { status: "unknown" }
  }
}

/**
 * Records an item's section from a section listing the server itself sent
 * (home's "New on" row, P10.12), so the poster route's access check for that
 * item needs no metadata request.
 */
export function rememberItemSectionKey(server: { url: string }, ratingKey: string, sectionKey: string): void {
  itemSectionCache.set(`${server.url}|${ratingKey}`, sectionKey)
}

/**
 * Drops both caches. For tests.
 *
 * @internal
 */
export function clearPlexSharedSectionCaches(): void {
  sharedServersCache.clear()
  itemSectionCache.clear()
}
