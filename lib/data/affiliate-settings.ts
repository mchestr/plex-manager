/**
 * The admin Affiliates page's Settings tab: the saved settings, and how many
 * users the Plex server shares with now. Admins only.
 *
 * @module lib/data/affiliate-settings
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { affiliateTiersFromConfig, type AffiliateTier } from "@/lib/affiliates/tiers"
import { getPlexUsers } from "@/lib/connections/plex"
import { withMachineIdentifier } from "@/lib/connections/plex-machine-id"
import { activeShareFor } from "@/lib/connections/plex-tv-users"
import { getActiveService } from "@/lib/data/active-service"
import { plexLibrarySectionIdsSchema } from "@/lib/invites/plex-library-ids"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("affiliate-settings")

export interface AffiliateSettingsView {
  enabled: boolean
  tiers: readonly AffiliateTier[]
  /** Places for all affiliates: joins in the last 30 days and open invites; null is no cap. */
  cap: number | null
  libraryIds: number[]
}

export async function getAffiliateSettingsView(): Promise<AffiliateSettingsView> {
  await assertAdmin()
  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { affiliateInvitesEnabled: true, affiliateTiers: true, affiliateServerCap: true, affiliateLibrarySectionIds: true },
  })
  const libraries = plexLibrarySectionIdsSchema.safeParse(config?.affiliateLibrarySectionIds)
  return {
    enabled: config?.affiliateInvitesEnabled ?? false,
    tiers: affiliateTiersFromConfig(config?.affiliateTiers),
    // No row yet reads as the schema default
    cap: config ? config.affiliateServerCap : 10,
    libraryIds: libraries.success ? libraries.data : [],
  }
}

/**
 * The users with an accepted share of the active Plex server, or null when
 * no server is set up or plex.tv does not answer. The page streams it, so it
 * never throws.
 */
export async function getPlexShareCount(): Promise<number | null> {
  await assertAdmin()
  try {
    const plex = await getActiveService("plex")
    if (!plex) return null
    const { machineIdentifier } = await withMachineIdentifier(plex)
    if (!machineIdentifier) return null
    const users = await getPlexUsers(plex.token)
    if (!users.success || !users.data) return null
    return users.data.filter((user) => activeShareFor(user, machineIdentifier)).length
  } catch (error) {
    logger.warn("Could not count the Plex shares", { error: String(error) })
    return null
  }
}
