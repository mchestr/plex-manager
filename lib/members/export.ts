/**
 * The member's own data as one JSON document (P11.15, GAP-36), for
 * `/account/export`. The keys follow `docs/privacy.md`; the output is checked
 * against the strict {@link MemberExportV1} schema, so no token, hash, asset
 * key or Stripe id reaches the file.
 *
 * @module lib/members/export
 */

import "server-only"

import { memberServices } from "@/lib/members/service"
import { ASSISTANT_TURN_LIMIT, EXPORT_FORMAT, MemberExportV1 } from "@/lib/members/export-schema"
import { prisma } from "@/lib/prisma"
import { getPlanName } from "@/lib/stripe/prices"
import { parseStoredRewind, readWrappedStatus } from "@/lib/wrapped/data/parse-stored"

const iso = (date: Date) => date.toISOString()
const isoOrNull = (date: Date | null) => date?.toISOString() ?? null

/** v3 as stored; v1 and v2 through the parser (rosters already stripped, P0.8). */
function rewindData(status: string, data: string): Pick<MemberExportV1["rewinds"][number], "version" | "data"> {
  if (status !== "completed") return { version: null, data: null }
  const stored = parseStoredRewind(data)
  if (stored.version === "invalid") return { version: null, data: null }
  return stored.version === 3 ? { version: 3, data: stored.data } : { version: stored.version, data: stored.legacy }
}

function shareStatus(share: { revokedAt: Date | null; expiresAt: Date | null }, now: Date) {
  if (share.revokedAt) return "revoked" as const
  return share.expiresAt && share.expiresAt <= now ? ("expired" as const) : ("active" as const)
}

async function loadRows(userId: string) {
  return Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, email: true, image: true, plexUserId: true, jellyfinUserId: true, timezone: true, createdAt: true },
    }),
    prisma.plexWrapped.findMany({
      where: { userId },
      orderBy: { year: "asc" },
      select: { id: true, year: true, edition: true, status: true, generatedAt: true, data: true },
    }),
    prisma.rewindPrefs.findMany({ where: { userId }, orderBy: { year: "asc" } }),
    prisma.rewindExclusion.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.rewindShare.findMany({ where: { wrapped: { userId } }, orderBy: { createdAt: "asc" }, include: { wrapped: { select: { year: true } } } }),
    prisma.userMediaMark.findMany({ where: { userId }, orderBy: { markedAt: "desc" } }),
    prisma.watchlistSyncSettings.findUnique({ where: { userId } }),
    prisma.watchlistSyncHistory.findMany({ where: { userId }, orderBy: { syncedAt: "desc" } }),
    prisma.subscription.findUnique({ where: { userId } }),
    prisma.discordConnection.findUnique({ where: { userId }, select: { username: true, globalName: true, linkedAt: true } }),
    prisma.lLMUsage.findMany({
      where: { userId, chatConversationId: { not: null }, OR: [{ prompt: { not: null } }, { response: { not: null } }] },
      orderBy: { createdAt: "desc" },
      take: ASSISTANT_TURN_LIMIT,
      select: { chatConversationId: true, createdAt: true, model: true, prompt: true, response: true },
    }),
    prisma.discordCommandLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { commandType: true, commandName: true, channelType: true, status: true, argsLength: true, createdAt: true },
    }),
  ])
}

/**
 * Builds and validates the export of `userId`'s data. Throws when the member
 * does not exist or the output fails {@link MemberExportV1}.
 */
export async function buildMemberExport(userId: string, now = new Date()): Promise<MemberExportV1> {
  const [user, rewinds, prefs, exclusions, shares, marks, settings, history, subscription, discord, turns, commands] = await loadRows(userId)

  return MemberExportV1.parse({
    format: EXPORT_FORMAT,
    version: 1,
    exportedAt: iso(now),
    profile: {
      name: user.name,
      email: user.email,
      image: user.image,
      services: memberServices(user),
      plexUserId: user.plexUserId,
      jellyfinUserId: user.jellyfinUserId,
      timezone: user.timezone,
      createdAt: iso(user.createdAt),
    },
    rewinds: rewinds.map((row) => {
      const status = readWrappedStatus(row.status, row.id)
      return { year: row.year, edition: row.edition, status, generatedAt: isoOrNull(row.generatedAt), ...rewindData(status, row.data) }
    }),
    rewindPrefs: prefs.map((row) => ({
      year: row.year,
      signed: row.signed,
      includeArt: row.includeArt,
      dailyDetail: row.dailyDetail,
      cardFacts: row.cardFacts,
      notify: row.notify,
    })),
    rewindExclusions: exclusions.map((row) => ({ ratingKey: row.ratingKey, kind: row.kind, title: row.title, hiddenAt: iso(row.createdAt) })),
    rewindShares: shares.map((row) => ({
      year: row.wrapped.year,
      pages: row.pages,
      signed: row.signed,
      includeArt: row.includeArt,
      dailyDetail: row.dailyDetail,
      status: shareStatus(row, now),
      createdAt: iso(row.createdAt),
      expiresAt: isoOrNull(row.expiresAt),
      revokedAt: isoOrNull(row.revokedAt),
    })),
    marks: marks.map((row) => ({
      mediaType: row.mediaType,
      plexRatingKey: row.plexRatingKey,
      title: row.title,
      year: row.year,
      parentTitle: row.parentTitle,
      seasonNumber: row.seasonNumber,
      episodeNumber: row.episodeNumber,
      markType: row.markType,
      note: row.note,
      markedVia: row.markedVia,
      markedAt: iso(row.markedAt),
    })),
    watchlist: {
      settings: settings && {
        syncEnabled: settings.syncEnabled,
        lastSyncAt: isoOrNull(settings.lastSyncAt),
        lastSyncStatus: settings.lastSyncStatus,
        totalItemsSynced: settings.totalItemsSynced,
        totalItemsRequested: settings.totalItemsRequested,
      },
      history: history.map((row) => ({
        title: row.title,
        year: row.year,
        mediaType: row.mediaType,
        plexRatingKey: row.plexRatingKey,
        tmdbId: row.tmdbId,
        tvdbId: row.tvdbId,
        imdbId: row.imdbId,
        status: row.status,
        syncedAt: iso(row.syncedAt),
        requestedAt: isoOrNull(row.requestedAt),
      })),
    },
    subscription: subscription && {
      status: subscription.status,
      plan: await getPlanName(subscription.priceId),
      currentPeriodEnd: isoOrNull(subscription.currentPeriodEnd),
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      canceledAt: isoOrNull(subscription.canceledAt),
    },
    discord: discord && { username: discord.username, globalName: discord.globalName, linkedAt: iso(discord.linkedAt) },
    assistantConversations: turns.map((row) => ({
      conversationId: row.chatConversationId ?? "",
      at: iso(row.createdAt),
      model: row.model,
      prompt: row.prompt,
      response: row.response,
    })),
    discordCommands: commands.map((row) => ({
      commandType: row.commandType,
      commandName: row.commandName,
      channelType: row.channelType,
      status: row.status,
      argsLength: row.argsLength,
      at: iso(row.createdAt),
    })),
  })
}
