/**
 * The affiliate invites switch, read from the database on every call. It is
 * never cached: an invite must stop working the moment an admin turns the
 * switch off, and a cached value can stay on another container for minutes.
 *
 * The switch reads as on only while all of these are true:
 *
 * - it is turned on;
 * - the library list holds at least one library (an empty list is never
 *   "every library");
 * - the active Plex server is the one it was turned on for
 *   (`affiliatePlexMachineId`), because a library key can name a different
 *   library on another server.
 *
 * @module lib/affiliates/settings
 */

import "server-only"

import { plexLibrarySectionIdsSchema } from "@/lib/invites/plex-library-ids"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"

export interface AffiliateSettings {
  on: boolean
  /** The libraries every affiliate invite shares; empty while none are set. */
  librarySectionIds: number[]
}

/**
 * The switch and the library list. Pass the transaction client from inside a
 * transaction, so a concurrent change to the switch conflicts with it.
 */
export async function readAffiliateSettings(db: PrismaTransactionClient = prisma): Promise<AffiliateSettings> {
  const config = await db.config.findUnique({
    where: { id: "config" },
    select: { affiliateInvitesEnabled: true, affiliateLibrarySectionIds: true, affiliatePlexMachineId: true },
  })
  const active = await db.plexServer.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { machineIdentifier: true },
  })

  const libraries = plexLibrarySectionIdsSchema.safeParse(config?.affiliateLibrarySectionIds)
  const librarySectionIds = libraries.success ? libraries.data : []
  const sameServer = !!config?.affiliatePlexMachineId && active?.machineIdentifier === config.affiliatePlexMachineId
  return { on: !!config?.affiliateInvitesEnabled && librarySectionIds.length > 0 && sameServer, librarySectionIds }
}
