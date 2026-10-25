/**
 * What Next year's links need from the server (P7.2): the active Plex
 * server's machine id, cached for 24 hours under the `plex-identity` tag, and
 * Overseerr's public URL. A failure leaves that link out; the titles still
 * print.
 *
 * @module lib/rewind/item-links
 */

import "server-only"

import { unstable_cache } from "next/cache"

import { getPlexServerIdentity } from "@/lib/connections/plex-connection"
import type { ItemLinks } from "@/lib/ui/plex-links"
import { createLogger } from "@/lib/utils/logger"
import { getActiveService } from "@/lib/data/active-service"

const logger = createLogger("rewind-links")
const DAY_S = 24 * 60 * 60

/**
 * The active server's machine id; the token is read inside, so it never
 * enters the cache key. Home's Watch on Plex link reads it too (P10.21).
 */
export const plexServerId = unstable_cache(
  async (): Promise<string | null> => {
    const plex = await getActiveService("plex")
    if (!plex) return null
    const identity = await getPlexServerIdentity(plex)
    // a thrown failure is not cached, so the next view asks again
    if (!identity.success || !identity.machineIdentifier) throw new Error("Plex identity unavailable")
    return identity.machineIdentifier
  },
  ["plex-identity"],
  { tags: ["plex-identity"], revalidate: DAY_S }
)

export async function loadItemLinks(): Promise<ItemLinks> {
  try {
    const [serverId, overseerr] = await Promise.all([
      plexServerId().catch(() => null),
      getActiveService("overseerr"),
    ])
    return { plexServerId: serverId, overseerrUrl: overseerr?.publicUrl ?? null }
  } catch (error) {
    logger.warn("Could not load Next year's title links", { error })
    return { plexServerId: null, overseerrUrl: null }
  }
}
