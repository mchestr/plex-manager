/**
 * The checks a generation request runs before anything is enqueued (SEC-22,
 * RWP-12, FR-48), shared by the member and admin actions in
 * `actions/rewind-generation.ts`.
 *
 * @module
 */

import "server-only"

import { prisma } from "@/lib/prisma"
import { consume, reward, type ConsumeResult } from "@/lib/security/rate-limit"
import { checkRewindEligibility } from "@/lib/wrapped/eligibility"
import { getActiveService } from "@/lib/data/active-service"

/**
 * Why a member's Rewind cannot be made, or null when it can. A member without
 * a Plex identity is refused before the configuration is read, so a direct
 * call on a Jellyfin-only server gets the same answer as the card (FR-48).
 */
export async function generationBlocker(user: {
  id: string
  plexUserId: string | null
}): Promise<"REWIND_NOT_ELIGIBLE" | "NO_PLEX_SERVER" | "NO_TAUTULLI" | null> {
  if (!user.plexUserId) return "REWIND_NOT_ELIGIBLE"

  const [plexServer, tautulli] = await Promise.all([
    getActiveService("plex"),
    getActiveService("tautulli"),
  ])
  if (!plexServer) return "NO_PLEX_SERVER"
  if (!tautulli) return "NO_TAUTULLI"

  const eligibility = await checkRewindEligibility({ id: user.id, plexUserId: user.plexUserId })
  return eligibility.eligible ? null : "REWIND_NOT_ELIGIBLE"
}

/** True while a run for this member and year is queued or running. */
export async function hasActiveGeneration(userId: string, year: number): Promise<boolean> {
  const active = await prisma.rewindGeneration.count({
    where: { userId, year, status: { in: ["queued", "running"] } },
  })
  return active > 0
}

/**
 * Spends one point of each member generation limit: 1 run per 10 minutes and
 * 3 per day (design 9.3, 9.4). A refused daily point refunds the burst point.
 */
export async function consumeGenerationPoints(userId: string): Promise<ConsumeResult> {
  const burst = await consume("rw:gen:burst", userId)
  if (!burst.ok) return burst
  const daily = await consume("rw:gen:daily", userId)
  if (!daily.ok) await reward("rw:gen:burst", userId)
  return daily
}

/** Gives back the points of a request that started no run. */
export async function refundGenerationPoints(userId: string): Promise<void> {
  await reward("rw:gen:burst", userId)
  await reward("rw:gen:daily", userId)
}
