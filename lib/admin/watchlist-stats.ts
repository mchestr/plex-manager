import "server-only"

import { assertAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { auditMemberListed } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("ADMIN_WATCHLIST")

async function readStats() {
  const [
    usersWithSyncEnabled,
    totalItemsSynced,
    totalItemsRequested,
    totalItemsSkipped,
    totalItemsNotPermitted,
    recentHistory,
  ] = await Promise.all([
    prisma.watchlistSyncSettings.count({ where: { syncEnabled: true } }),
    prisma.watchlistSyncHistory.count(),
    prisma.watchlistSyncHistory.count({ where: { status: "REQUESTED" } }),
    prisma.watchlistSyncHistory.count({ where: { status: "SKIPPED_NO_EXTERNAL_ID" } }),
    prisma.watchlistSyncHistory.count({ where: { status: "NOT_PERMITTED" } }),
    prisma.watchlistSyncHistory.findMany({
      orderBy: { syncedAt: "desc" },
      take: 10,
      select: { id: true, title: true, status: true, user: { select: { name: true, email: true } } },
    }),
  ])
  return {
    usersWithSyncEnabled,
    totalItemsSynced,
    totalItemsRequested,
    totalItemsSkipped,
    totalItemsNotPermitted,
    recentHistory,
  }
}

export type WatchlistSyncStats = Awaited<ReturnType<typeof readStats>>

/**
 * The Watchlist sync section's figures: members with sync on, items synced,
 * requests created, items with no TMDB match, requests Overseerr refused and
 * the ten latest history rows (P10.7: a server read,
 * no longer an action the section called on mount). The settings page starts
 * it without awaiting and the section reads it inside Suspense, so the page
 * never waits for it. A failed read gives null, which hides the figures.
 * The latest titles are members' content, so a read is audited as a listing
 * (P11.16).
 */
export async function getWatchlistSyncStats(): Promise<WatchlistSyncStats | null> {
  const session = await assertAdmin()
  await auditMemberListed("watchlist-panel", session.user.id)
  try {
    return await readStats()
  } catch (error) {
    logger.error("Could not read the watchlist sync stats", error)
    return null
  }
}
