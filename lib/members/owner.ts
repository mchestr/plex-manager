/**
 * The Plex server owner: the account that set the active server up, whom
 * every login promotes to admin, so admin actions never demote, disable or
 * remove it (P4.7).
 *
 * @module lib/members/owner
 */

import "server-only"

import { prisma } from "@/lib/prisma"

/** Whether `plexUserId` owns the active Plex server. */
export async function isPlexServerOwner(plexUserId: string | null): Promise<boolean> {
  if (!plexUserId) {
    return false
  }
  const plexServer = await prisma.plexServer.findFirst({
    where: { isActive: true },
    select: { adminPlexUserId: true },
  })
  return plexServer?.adminPlexUserId === plexUserId
}
