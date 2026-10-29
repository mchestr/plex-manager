/**
 * The rows member removal touches, following the inventory in
 * `docs/privacy.md`: what it counts for the dry run, and the deletes that run
 * in its transaction before the `User` row goes and the rest cascades.
 *
 * Two kinds of row are not reached by the cascade and are handled here:
 * rows keyed by the member's Discord id (command log, chat sessions, pending
 * selections), and LLM text that admins generated for the member under their
 * own user id (the admin regenerate path, P2.1), which is anonymised.
 * Affiliate invites are in `lib/members/erase-affiliates`.
 *
 * @module lib/members/erase-inventory
 */

import "server-only"

import type { Prisma } from "@/lib/generated/prisma/client"
import { countAffiliateRows, deleteUnusedAffiliateInvites, type AffiliateCounts } from "@/lib/members/erase-affiliates"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"

/** Everything that identifies the member's rows. */
export interface EraseSubject {
  userId: string
  /** The linked Discord id, plus any the command log recorded for the member. */
  discordUserIds: string[]
  wrappedIds: string[]
  generationIds: string[]
}

/**
 * Rows removed per inventory table; for `llmUsageAnonymised`, rows emptied of
 * text, and for the `*Kept` affiliate keys, rows kept without the member's id.
 */
export type InventoryCounts = Record<
  | "user"
  | "plexWrapped"
  | "rewindGeneration"
  | "rewindShare"
  | "rewindShareVisitDay"
  | "rewindView"
  | "wrappedShareVisit"
  | "rewindPrefs"
  | "rewindExclusion"
  | "llmUsage"
  | "llmUsageAnonymised"
  | "chatConversation"
  | "chatConversationMessage"
  | "discordChatSession"
  | "discordCommandLog"
  | "discordPendingSelection"
  | "discordConnection"
  | "discordOAuthState"
  | "userMediaMark"
  | "watchlistSyncSettings"
  | "watchlistSyncHistory"
  | "inviteUsage"
  | "subscription",
  number
> &
  AffiliateCounts

/** Reads the ids that find the member's rows. */
export async function loadEraseSubject(userId: string, linkedDiscordUserId: string | null): Promise<EraseSubject> {
  const [logged, wrapped, generations] = await Promise.all([
    prisma.discordCommandLog.findMany({ where: { userId }, select: { discordUserId: true }, distinct: ["discordUserId"] }),
    prisma.plexWrapped.findMany({ where: { userId }, select: { id: true } }),
    prisma.rewindGeneration.findMany({ where: { userId }, select: { id: true } }),
  ])
  const discordUserIds = new Set(logged.map((row) => row.discordUserId))
  if (linkedDiscordUserId) discordUserIds.add(linkedDiscordUserId)
  return {
    userId,
    discordUserIds: [...discordUserIds],
    wrappedIds: wrapped.map((row) => row.id),
    generationIds: generations.map((row) => row.id),
  }
}

/** Other users' LLM rows about the member that still hold text. */
function anonymiseWhere({ userId, wrappedIds, generationIds }: EraseSubject): Prisma.LLMUsageWhereInput {
  return {
    userId: { not: userId },
    OR: [{ generationId: { in: generationIds } }, { wrappedId: { in: wrappedIds } }],
    AND: [{ OR: [{ prompt: { not: null } }, { response: { not: null } }] }],
  }
}

const commandLogWhere = ({ userId, discordUserIds }: EraseSubject): Prisma.DiscordCommandLogWhereInput => ({
  OR: [{ userId }, { discordUserId: { in: discordUserIds } }],
})

/** How many rows removal deletes or anonymises in each table. */
export async function countInventory(subject: EraseSubject): Promise<InventoryCounts> {
  const { userId, discordUserIds, wrappedIds } = subject
  const byUser = { where: { userId } }
  const byWrapped = { where: { wrappedId: { in: wrappedIds } } }
  const [
    user, plexWrapped, rewindGeneration, rewindShare, rewindShareVisitDay, rewindView, wrappedShareVisit,
    rewindPrefs, rewindExclusion, llmUsage, llmUsageAnonymised, chatConversation, chatConversationMessage,
    discordChatSession, discordCommandLog, discordPendingSelection, discordConnection, discordOAuthState,
    userMediaMark, watchlistSyncSettings, watchlistSyncHistory, inviteUsage, subscription, affiliates,
  ] = await Promise.all([
    prisma.user.count({ where: { id: userId } }),
    prisma.plexWrapped.count(byUser),
    prisma.rewindGeneration.count(byUser),
    prisma.rewindShare.count(byWrapped),
    prisma.rewindShareVisitDay.count({ where: { share: { wrappedId: { in: wrappedIds } } } }),
    prisma.rewindView.count(byWrapped),
    prisma.wrappedShareVisit.count(byWrapped),
    prisma.rewindPrefs.count(byUser),
    prisma.rewindExclusion.count(byUser),
    prisma.lLMUsage.count(byUser),
    prisma.lLMUsage.count({ where: anonymiseWhere(subject) }),
    prisma.chatConversation.count(byUser),
    prisma.chatConversationMessage.count({ where: { conversation: { userId } } }),
    prisma.discordChatSession.count({
      where: { OR: [{ discordUserId: { in: discordUserIds } }, { chatConversation: { userId } }] },
    }),
    prisma.discordCommandLog.count({ where: commandLogWhere(subject) }),
    prisma.discordPendingSelection.count({ where: { discordUserId: { in: discordUserIds } } }),
    prisma.discordConnection.count(byUser),
    prisma.discordOAuthState.count(byUser),
    prisma.userMediaMark.count(byUser),
    prisma.watchlistSyncSettings.count(byUser),
    prisma.watchlistSyncHistory.count(byUser),
    prisma.inviteUsage.count(byUser),
    prisma.subscription.count(byUser),
    countAffiliateRows(userId),
  ])
  return {
    user, plexWrapped, rewindGeneration, rewindShare, rewindShareVisitDay, rewindView, wrappedShareVisit,
    rewindPrefs, rewindExclusion, llmUsage, llmUsageAnonymised, chatConversation, chatConversationMessage,
    discordChatSession, discordCommandLog, discordPendingSelection, discordConnection, discordOAuthState,
    userMediaMark, watchlistSyncSettings, watchlistSyncHistory, inviteUsage, subscription, ...affiliates,
  }
}

/**
 * The transaction's writes: the rows the cascade misses, then the `User` row,
 * whose relations cascade to everything else in the inventory.
 */
export async function deleteInventory(tx: PrismaTransactionClient, subject: EraseSubject): Promise<void> {
  const { userId, discordUserIds } = subject
  await tx.discordCommandLog.deleteMany({ where: commandLogWhere(subject) })
  await tx.discordChatSession.deleteMany({ where: { discordUserId: { in: discordUserIds } } })
  await tx.discordPendingSelection.deleteMany({ where: { discordUserId: { in: discordUserIds } } })
  await tx.lLMUsage.updateMany({ where: anonymiseWhere(subject), data: { prompt: null, response: null } })
  await deleteUnusedAffiliateInvites(tx, userId)
  await tx.user.deleteMany({ where: { id: userId } })
}
