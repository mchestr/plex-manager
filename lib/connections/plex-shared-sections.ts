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
 *    owner token) and returns the local section keys shared with one Plex
 *    user, or `'all'` when the share covers every library.
 * 2. {@link getItemSectionKey} asks the Plex server for an item's metadata
 *    (`GET <url>/library/metadata/<ratingKey>`) and returns its
 *    `librarySectionID`.
 *
 * Both responses are validated with Zod. Every failure (timeout, network
 * error, non-2xx, unexpected shape) returns `null`, never throws, so callers
 * deny access when plex.tv or the server cannot be reached.
 *
 * ## Caching
 *
 * - The parsed share list is cached per server for 10 minutes, so one
 *   plex.tv call answers every member during that window.
 * - An item's section key is cached for 24 hours; items rarely move between
 *   libraries.
 * - Failures are not cached, so a recovered plex.tv is used on the next call.
 *
 * ## Response shape (plex.tv)
 *
 * ```xml
 * <MediaContainer machineIdentifier="..." size="2">
 *   <SharedServer userID="1001" allLibraries="0" ...>
 *     <Section key="1" shared="1" ... />
 *     <Section key="2" shared="0" ... />
 *   </SharedServer>
 *   <SharedServer userID="1002" allLibraries="1" ... />
 * </MediaContainer>
 * ```
 *
 * Entries without a `userID` (invites not yet tied to an account) are skipped.
 *
 * @module
 */

import "server-only"

import { XMLParser } from "fast-xml-parser"
import { z } from "zod"

import { fetchWithTimeout } from "@/lib/utils/fetch-with-timeout"
import { createTtlCache } from "@/lib/utils/ttl-cache"

import { getPlexServerIdentity } from "./plex-connection"
import { getClientIdentifier, logger } from "./plex-core"

/** Upstream timeout for both lookups; the poster route must answer within 3 s. */
const LOOKUP_TIMEOUT_MS = 3000
const SHARED_SERVERS_TTL_MS = 10 * 60 * 1000
const ITEM_SECTION_TTL_MS = 24 * 60 * 60 * 1000

/** Section keys a member may browse: every library, or a set of local section keys. */
export type SharedSectionKeys = "all" | ReadonlySet<string>

interface PlexServerConfig {
  url: string
  token: string
}

const sharedServersSchema = z.object({
  MediaContainer: z.object({
    SharedServer: z
      .array(
        z.object({
          "@_userID": z.string().optional(),
          "@_allLibraries": z.string().optional(),
          Section: z
            .array(
              z.object({
                "@_key": z.string(),
                "@_shared": z.string().optional(),
              })
            )
            .optional(),
        })
      )
      .optional(),
  }),
})

const itemMetadataSchema = z.object({
  MediaContainer: z.object({
    librarySectionID: z
      .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
      .transform(String),
  }),
})

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  isArray: (name) => name === "SharedServer" || name === "Section",
})

const sharedServersCache = createTtlCache<string, ReadonlyMap<string, SharedSectionKeys>>({
  ttlMs: SHARED_SERVERS_TTL_MS,
  maxEntries: 8,
})
const itemSectionCache = createTtlCache<string, string>({
  ttlMs: ITEM_SECTION_TTL_MS,
  maxEntries: 10_000,
})

/**
 * Parses a plex.tv `shared_servers` document into Plex user ID → shared
 * section keys. Returns `null` when the document does not have the expected
 * shape.
 *
 * @internal Exported for tests.
 */
export function parseSharedServersXml(xml: string): Map<string, SharedSectionKeys> | null {
  const parsed = sharedServersSchema.safeParse(xmlParser.parse(xml))
  if (!parsed.success) return null

  const byUser = new Map<string, SharedSectionKeys>()
  for (const server of parsed.data.MediaContainer.SharedServer ?? []) {
    const userId = server["@_userID"]
    if (!userId || userId === "0") continue
    if (server["@_allLibraries"] === "1") {
      byUser.set(userId, "all")
      continue
    }
    const keys = (server.Section ?? [])
      .filter((section) => section["@_shared"] === "1")
      .map((section) => section["@_key"])
    byUser.set(userId, new Set(keys))
  }
  return byUser
}

async function loadSharedServers(
  server: PlexServerConfig
): Promise<ReadonlyMap<string, SharedSectionKeys> | null> {
  const cached = sharedServersCache.get(server.url)
  if (cached) return cached

  try {
    const identity = await getPlexServerIdentity(server, { timeoutMs: LOOKUP_TIMEOUT_MS })
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
      timeoutMs: LOOKUP_TIMEOUT_MS,
    })
    if (!response.ok) {
      logger.warn("Shared sections: plex.tv request failed", { status: response.status })
      return null
    }

    const byUser = parseSharedServersXml(await response.text())
    if (!byUser) {
      logger.warn("Shared sections: unexpected plex.tv response shape")
      return null
    }

    sharedServersCache.set(server.url, byUser)
    return byUser
  } catch (error) {
    logger.warn("Shared sections: plex.tv lookup failed", {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * The library section keys the server shares with a Plex user.
 *
 * @param server - The active Plex server (URL and owner token)
 * @param plexUserId - The member's Plex account ID
 * @returns `'all'` for a share covering every library, the set of shared
 *   local section keys (empty when the user has no share), or `null` when
 *   plex.tv could not be read
 */
export async function getSharedSectionKeys(
  server: PlexServerConfig,
  plexUserId: string
): Promise<SharedSectionKeys | null> {
  const byUser = await loadSharedServers(server)
  if (!byUser) return null
  return byUser.get(plexUserId) ?? new Set<string>()
}

/**
 * The library section key (`librarySectionID`) of a Plex item.
 *
 * @param server - The active Plex server (URL and owner token)
 * @param ratingKey - The item's rating key (digits only; the caller validates it)
 * @returns The section key, or `null` when the item is missing or the server
 *   could not be read
 */
export async function getItemSectionKey(
  server: PlexServerConfig,
  ratingKey: string
): Promise<string | null> {
  const cacheKey = `${server.url}|${ratingKey}`
  const cached = itemSectionCache.get(cacheKey)
  if (cached) return cached

  try {
    const response = await fetchWithTimeout(`${server.url}/library/metadata/${ratingKey}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Plex-Token": server.token,
      },
      timeoutMs: LOOKUP_TIMEOUT_MS,
    })
    if (!response.ok) return null

    const parsed = itemMetadataSchema.safeParse(await response.json())
    if (!parsed.success) return null

    const sectionKey = parsed.data.MediaContainer.librarySectionID
    itemSectionCache.set(cacheKey, sectionKey)
    return sectionKey
  } catch (error) {
    logger.debug("Item section lookup failed", {
      ratingKey,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/** Drops both caches. For tests. */
export function clearPlexSharedSectionCaches(): void {
  sharedServersCache.clear()
  itemSectionCache.clear()
}
