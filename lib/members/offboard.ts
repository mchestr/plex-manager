/**
 * What every loss of access does to a member's stored data (GAP-31): their
 * watchlist sync stops and their plex.tv token is cleared, so nothing keeps
 * reading their private watchlist or filing requests for them. Unshare, the
 * Stripe revoke and removal call it; a later sign-in stores a fresh token.
 * It also stamps `User.accessEndedAt`, which the admin affiliate tables read
 * as "No longer a member"; a sign-in with access, or a Stripe grant, clears it.
 *
 * @module lib/members/offboard
 */

import "server-only"

import { prisma } from "@/lib/prisma"

/**
 * Turns the member's watchlist sync off, nulls `User.plexAuthToken` and sets `User.accessEndedAt`.
 * Idempotent; a member with no row changes nothing.
 *
 * @param userId - The member whose access ended.
 */
export async function stopSyncAndClearPlexToken(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.watchlistSyncSettings.updateMany({ where: { userId }, data: { syncEnabled: false } }),
    prisma.user.updateMany({ where: { id: userId }, data: { plexAuthToken: null, accessEndedAt: new Date() } }),
  ])
}
