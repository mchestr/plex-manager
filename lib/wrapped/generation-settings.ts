/**
 * Whether members may generate a Rewind now (P2.2, GAP-40), for the
 * generation actions. Server-only: it was a public read in a `'use server'`
 * module until P11.5.
 *
 * @module lib/wrapped/generation-settings
 */

import "server-only"

import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { DEFAULT_SEASON, getSeasonState, seasonStateAt } from "@/lib/wrapped/season"

const logger = createLogger("WRAPPED_SETTINGS")

/**
 * The Rewind generation settings.
 *
 * - `featureEnabled`: the admin's on/off switch (`Config.wrappedEnabled`).
 * - `seasonOpen`: the season window is open now, in the server zone.
 * - `wrappedEnabled`: both, so members may generate now. Admins regenerate
 *   whenever the feature is on, inside the window or not.
 * - `wrappedYear`: the season year (`lib/wrapped/season.ts`).
 */
export async function getWrappedSettings() {
  try {
    const [config, season] = await Promise.all([
      prisma.config.findUnique({ where: { id: "config" }, select: { wrappedEnabled: true } }),
      getSeasonState(),
    ])
    const featureEnabled = config?.wrappedEnabled ?? true
    return {
      featureEnabled,
      seasonOpen: season.isOpen,
      wrappedEnabled: featureEnabled && season.isOpen,
      wrappedYear: season.seasonYear,
    }
  } catch (error) {
    logger.error("Error getting wrapped settings", error)
    // Fail as the default configuration would: the default window, in UTC
    const season = seasonStateAt(new Date(), DEFAULT_SEASON.opens, DEFAULT_SEASON.closes, "UTC")
    return {
      featureEnabled: true,
      seasonOpen: season.isOpen,
      wrappedEnabled: season.isOpen,
      wrappedYear: season.seasonYear,
    }
  }
}
