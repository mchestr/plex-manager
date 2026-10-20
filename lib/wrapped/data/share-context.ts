/**
 * Reads what the share-safe projection depends on besides the stored issue,
 * at projection time: the admin's card flags, the server name, the member's
 * hidden titles and their `exclusionsVersion`. Reading them per request is
 * what makes a hidden title or a flag change leave every card at once,
 * before any regeneration (design 6.1, 9.3).
 *
 * @module lib/wrapped/data/share-context
 */

import "server-only"

import { prisma } from "@/lib/prisma"
import { getAppSettings } from "@/lib/settings/app-settings"

import type { ShareContext } from "./share-safe-schema"

/** The context for the owner of a Rewind row. */
export async function loadShareContext(rewind: { userId: string; year: number }): Promise<ShareContext> {
  const { userId, year } = rewind
  const [config, prefs, exclusions, settings] = await Promise.all([
    prisma.config.findUnique({
      where: { id: "config" },
      select: { rewindPublicCounts: true, rewindShowServerNameOnCards: true, rewindAllowArtOnCards: true },
    }),
    prisma.rewindPrefs.findUnique({ where: { userId_year: { userId, year } }, select: { exclusionsVersion: true } }),
    prisma.rewindExclusion.findMany({ where: { userId }, select: { ratingKey: true } }),
    getAppSettings(),
  ])
  return {
    userId,
    serverName: settings.serverName,
    showServerName: config?.rewindShowServerNameOnCards ?? true,
    publicCounts: config?.rewindPublicCounts ?? false,
    allowArt: config?.rewindAllowArtOnCards ?? true,
    hiddenKeys: new Set(exclusions.map((e) => e.ratingKey)),
    exclusionsVersion: prefs?.exclusionsVersion ?? 0,
  }
}
