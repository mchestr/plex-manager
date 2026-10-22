/**
 * What every loss of access does to a member's stored data (GAP-31): their
 * watchlist sync stops and their plex.tv token is cleared, so nothing keeps
 * reading their private watchlist or filing requests for them. Unshare, the
 * Stripe revoke and removal call it; a later sign-in stores a fresh token.
 *
 * @module lib/members/offboard
 */

import "server-only"

import { prisma } from "@/lib/prisma"

/**
 * Turns the member's watchlist sync off and nulls `User.plexAuthToken`.
 * Idempotent; a member with no row changes nothing.
 *
 * @param userId - The member whose access ended.
 */
export async function stopSyncAndClearPlexToken(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.watchlistSyncSettings.updateMany({ where: { userId }, data: { syncEnabled: false } }),
    prisma.user.updateMany({ where: { id: userId }, data: { plexAuthToken: null } }),
  ])
}
