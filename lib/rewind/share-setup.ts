/**
 * What the share sheet starts from for a member's v3 Rewind (design 6.3):
 * the cards the issue can share, the admin's flags, the member's saved
 * choices, their live link (never its URL) and the default expiry's date.
 *
 * @module lib/rewind/share-setup
 */

import "server-only"

import { z } from "zod"

import { hasEntitlement } from "@/lib/actions/entitlement"
import { prisma } from "@/lib/prisma"
import { eligibleCards } from "@/lib/rewind/cards/eligible"
import type { ShareSetup } from "@/lib/rewind/share-sheet"
import { getAppSettings } from "@/lib/settings/app-settings"
import { CardFactIdSchema, SharePageTypeSchema } from "@/lib/wrapped/data/share-safe-schema"
import { getSeasonState } from "@/lib/wrapped/season"

const CardFactsSchema = z.array(CardFactIdSchema).max(3).catch([])
const PagesSchema = z.array(SharePageTypeSchema).catch([])

/** The setup for `userId`'s Rewind row `rewindId` of `year`, whose printed pages are `pages`. */
export async function loadShareSetup({
  userId, rewindId, year, pages,
}: { userId: string; rewindId: string; year: number; pages: ReadonlyArray<{ type: string }> }): Promise<ShareSetup> {
  const now = new Date()
  const [config, prefs, link, canShare, season, settings] = await Promise.all([
    prisma.config.findUnique({ where: { id: "config" }, select: { rewindAllowArtOnCards: true, rewindPublicLinks: true } }),
    prisma.rewindPrefs.findUnique({
      where: { userId_year: { userId, year } },
      select: { signed: true, includeArt: true, dailyDetail: true, cardFacts: true },
    }),
    prisma.rewindShare.findFirst({
      where: { wrappedId: rewindId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: { createdAt: "desc" },
      select: { id: true, pages: true, expiresAt: true },
    }),
    hasEntitlement(userId, "full"),
    getSeasonState(now),
    getAppSettings(),
  ])
  const closes = new Date(season.closesAt.getTime() - 1000)
  return {
    rewindId,
    year,
    cards: eligibleCards({ pages }, { dailyDetail: prefs?.dailyDetail ?? false }),
    allowArt: config?.rewindAllowArtOnCards ?? true,
    publicLinks: config?.rewindPublicLinks ?? true,
    canShare,
    choices: {
      signed: prefs?.signed ?? false,
      includeArt: prefs?.includeArt ?? false,
      dailyDetail: prefs?.dailyDetail ?? false,
      cardFacts: CardFactsSchema.parse(prefs?.cardFacts ?? []),
    },
    link: link ? { shareId: link.id, pages: PagesSchema.parse(link.pages), expiresAt: link.expiresAt?.toISOString() ?? null } : null,
    seasonCloses: new Intl.DateTimeFormat(settings.locale, { day: "numeric", month: "long", year: "numeric", timeZone: settings.timeZone }).format(closes),
  }
}
