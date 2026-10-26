/**
 * A member's request limits for the home page and `/mystats`: their tier from
 * all-time watch time, how far they are from the next, and the requests they
 * have used and have left in this period (Overseerr's `/user/{id}/quota`).
 *
 * Nothing here throws. It returns `null` when the feature is off, the member
 * has no Plex account, or Tautulli or Overseerr is not connected; a call that
 * fails leaves its part `null` and the rest still shows.
 *
 * @module lib/request-tiers/member-limits
 */

import "server-only"

import { buildOverseerrUserIndex, findOverseerrUserId } from "@/lib/connections/overseerr"
import { getOverseerrUserUsage, type OverseerrUserUsage } from "@/lib/connections/overseerr-quota"
import { getAllTimeWatchHours } from "@/lib/connections/tautulli-watch-time"
import { getActiveService } from "@/lib/data/active-service"
import { prisma } from "@/lib/prisma"
import { tierProgress, tiersFromConfig, type RequestTier, type TierProgress } from "@/lib/request-tiers/tiers"

export interface MemberRequestLimits {
  tiers: RequestTier[]
  /** The member's all-time hours; null when Tautulli did not answer. */
  hours: number | null
  progress: TierProgress | null
  /** An admin set this member's limits by hand, so the tiers do not apply. */
  excluded: boolean
  usage: OverseerrUserUsage | null
}

export async function getMemberRequestLimits(userId: string): Promise<MemberRequestLimits | null> {
  const [user, config, tautulli, overseerr] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { plexUserId: true, requestTiersExcluded: true } }),
    prisma.config.findUnique({ where: { id: "config" }, select: { requestTiersEnabled: true, requestTiers: true } }),
    getActiveService("tautulli"),
    getActiveService("overseerr"),
  ])
  if (!config?.requestTiersEnabled || !user?.plexUserId || !tautulli || !overseerr) return null

  const plexId = Number(user.plexUserId)
  const signal = AbortSignal.timeout(8000)
  const index = await buildOverseerrUserIndex(overseerr, { signal })
  const overseerrUserId = index.ok ? findOverseerrUserId(index.data, user.plexUserId) : null

  const [watch, usage] = await Promise.all([
    Number.isSafeInteger(plexId) ? getAllTimeWatchHours(tautulli, plexId, { signal }) : null,
    overseerrUserId === null ? null : getOverseerrUserUsage(overseerr, overseerrUserId, { signal }),
  ])

  const tiers = [...tiersFromConfig(config.requestTiers)]
  const hours = watch?.ok ? watch.data : null
  return {
    tiers,
    hours,
    progress: hours === null ? null : tierProgress(hours, tiers),
    excluded: user.requestTiersExcluded,
    usage: usage?.ok ? usage.data : null,
  }
}
