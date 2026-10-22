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
 *    owner token; parsed by `./plex-shared-servers-xml`).
 * 2. {@link getItemSectionKey} asks the Plex server for an item's metadata
 *    (`GET <url>/library/metadata/<ratingKey>`).
 *
 * Responses are validated with Zod. Failures (timeout, network error,
 * unexpected status or shape) are reported, never thrown, so callers deny
 * access when plex.tv or the server cannot be read. Each call takes a
 * `timeoutMs` (default 3 s) that covers the whole lookup, body included.
 *
 * ## Caching
 *
 * - The share list is cached per server for 10 minutes; concurrent callers
 *   share one plex.tv load (and the timeout of the caller that started it).
 * - An item's section key is cached for 24 hours.
 * - Failures are not cached, so a recovered plex.tv is used on the next call.
 *
 * @module
 */

import "server-only"

import { z } from "zod"

import { fetchWithTimeout } from "@/lib/utils/fetch-with-timeout"
import { createLoadingCache, createTtlCache } from "@/lib/utils/ttl-cache"

import { getPlexServerIdentity } from "./plex-connection"
import { getClientIdentifier, logger } from "./plex-core"
import { parseSharedServersXml, type SharedSectionKeys } from "./plex-shared-servers-xml"

export type { SharedSectionKeys } from "./plex-shared-servers-xml"

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
  /** Time allowed for the whole lookup (default 3000 ms). */
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
  librarySectionID: z
    .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
    .transform(String),
})

const itemMetadataSchema = z.object({
  MediaContainer: z.object({ Metadata: z.array(z.unknown()).optional() }).loose(),
})

type SharedServers = ReadonlyMap<string, SharedSectionKeys>

const sharedServersCache = createLoadingCache<string, SharedServers | null>({
  ttlMs: SHARED_SERVERS_TTL_MS,
  maxEntries: 8,
  keep: (byUser) => byUser !== null,
})
const itemSectionCache = createTtlCache<string, string>({
  ttlMs: ITEM_SECTION_TTL_MS,
  maxEntries: 10_000,
})

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function loadSharedServers(
  server: PlexServerConfig,
  timeoutMs: number
): Promise<SharedServers | null> {
  const deadline = Date.now() + timeoutMs
  try {
    const identity = await getPlexServerIdentity(server, { timeoutMs })
    if (!identity.success || !identity.machineIdentifier) {
      logger.warn("Shared sections: could not read the server's machine identifier", {
        error: identity.error,
      })
      return null
    }

    const url = `https://plex.tv/api/servers/${encodeURIComponent(identity.machineIdentifier)}/shared_servers`
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

    const byUser = parseSharedServersXml(await response.text())
    if (!byUser) logger.warn("Shared sections: unexpected plex.tv response shape")
    return byUser
  } catch (error) {
    logger.warn("Shared sections: plex.tv lookup failed", { error: errorMessage(error) })
    return null
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
  const byUser = await sharedServersCache.get(server.url, () =>
    loadSharedServers(server, timeoutMs)
  )
  if (!byUser) return null
  return byUser.get(plexUserId) ?? new Set<string>()
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
      headers: {
        Accept: "application/json",
        "X-Plex-Token": server.token,
      },
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
