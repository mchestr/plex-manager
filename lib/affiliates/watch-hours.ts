/**
 * A member's watch hours, read live from Tautulli and stored on the `User`
 * row (`watchHours`, `watchHoursLast30Days`, `watchHoursReadAt`). The admin
 * tables read the stored values; only the approval re-check reads live.
 *
 * Each read also updates the member's APPROVED application: `tierIndex`, and
 * `tierRaisedAt` when the tier rose since the last read.
 *
 * @module lib/affiliates/watch-hours
 */

import "server-only"

import { affiliateTierIndex, affiliateTiersFromConfig } from "@/lib/affiliates/tiers"
import { getWatchHours } from "@/lib/connections/tautulli-watch-time"
import { getActiveService } from "@/lib/data/active-service"
import { prisma } from "@/lib/prisma"

const READ_TIMEOUT_MS = 15_000

export type WatchHoursResult =
  | { ok: true; allTime: number; last30Days: number }
  | { ok: false; code: "NOT_CONNECTED" | "UNAVAILABLE" | "NO_PLEX_ID" }

/** Reads the member's hours from Tautulli and stores them. Never throws on a Tautulli failure. */
export async function readWatchHours(userId: string): Promise<WatchHoursResult> {
  const [user, tautulli] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { plexUserId: true } }),
    getActiveService("tautulli"),
  ])
  const plexUserId = user?.plexUserId
  if (!plexUserId || !/^\d+$/.test(plexUserId) || !Number.isSafeInteger(Number(plexUserId))) return { ok: false, code: "NO_PLEX_ID" }
  if (!tautulli) return { ok: false, code: "NOT_CONNECTED" }

  const read = await getWatchHours(tautulli, Number(plexUserId), { signal: AbortSignal.timeout(READ_TIMEOUT_MS) })
  if (!read.ok) return { ok: false, code: "UNAVAILABLE" }
  const { allTime, last30Days } = read.data
  const now = new Date()

  await prisma.user.update({
    where: { id: userId },
    data: { watchHours: allTime, watchHoursLast30Days: last30Days, watchHoursReadAt: now },
  })

  const application = await prisma.affiliateApplication.findUnique({
    where: { openUserId: userId },
    select: { id: true, status: true, tierIndex: true },
  })
  if (application?.status === "APPROVED") {
    const config = await prisma.config.findUnique({ where: { id: "config" }, select: { affiliateTiers: true } })
    const tierIndex = affiliateTierIndex(allTime, affiliateTiersFromConfig(config?.affiliateTiers))
    if (tierIndex !== application.tierIndex) {
      const rose = application.tierIndex !== null && tierIndex > application.tierIndex
      await prisma.affiliateApplication.updateMany({
        where: { id: application.id, status: "APPROVED" },
        data: { tierIndex, ...(rose && { tierRaisedAt: now }) },
      })
    }
  }

  return { ok: true, allTime, last30Days }
}
