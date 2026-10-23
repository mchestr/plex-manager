import "server-only"

import { getMarkTypeLabel } from "@/lib/discord/media/mark-labels"
import { prisma } from "@/lib/prisma"

/** Marks per page of the account page's table. */
export const MARKS_PAGE_SIZE = 25
/** The newest watchlist items and conversations the account page lists. */
export const LIST_LIMIT = 50

export interface MarkRow {
  id: string
  title: string
  mark: string
  markedAt: string
}

export interface DataItem {
  id: string
  title: string
  at: string
}

export interface YourData {
  marks: { rows: MarkRow[]; page: number; total: number }
  watchlist: { rows: DataItem[]; total: number }
  conversations: { rows: DataItem[]; total: number }
}

function markTitle(mark: { title: string; year: number | null; parentTitle: string | null; seasonNumber: number | null; episodeNumber: number | null }) {
  const episode = mark.seasonNumber != null && mark.episodeNumber != null ? ` S${mark.seasonNumber}E${mark.episodeNumber}` : ""
  const name = mark.parentTitle && episode ? `${mark.parentTitle}${episode}: ${mark.title}` : mark.title
  return mark.year ? `${name} (${mark.year})` : name
}

/**
 * The "Your data" lists on `/account` (P11.15): one page of the member's
 * marks, and the newest watchlist history items and assistant conversations.
 */
export async function getYourData(userId: string, marksPage: number): Promise<YourData> {
  const [marks, markTotal, history, historyTotal, conversations, conversationTotal] = await Promise.all([
    prisma.userMediaMark.findMany({
      where: { userId },
      orderBy: [{ markedAt: "desc" }, { id: "asc" }],
      skip: (marksPage - 1) * MARKS_PAGE_SIZE,
      take: MARKS_PAGE_SIZE,
      select: { id: true, title: true, year: true, parentTitle: true, seasonNumber: true, episodeNumber: true, markType: true, markedAt: true },
    }),
    prisma.userMediaMark.count({ where: { userId } }),
    prisma.watchlistSyncHistory.findMany({
      where: { userId },
      orderBy: { syncedAt: "desc" },
      take: LIST_LIMIT,
      select: { id: true, title: true, year: true, syncedAt: true },
    }),
    prisma.watchlistSyncHistory.count({ where: { userId } }),
    prisma.chatConversation.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
      select: { id: true, createdAt: true },
    }),
    prisma.chatConversation.count({ where: { userId } }),
  ])

  return {
    marks: {
      page: marksPage,
      total: markTotal,
      rows: marks.map((mark) => ({ id: mark.id, title: markTitle(mark), mark: getMarkTypeLabel(mark.markType), markedAt: mark.markedAt.toISOString() })),
    },
    watchlist: {
      total: historyTotal,
      rows: history.map((item) => ({ id: item.id, title: item.year ? `${item.title} (${item.year})` : item.title, at: item.syncedAt.toISOString() })),
    },
    conversations: {
      total: conversationTotal,
      rows: conversations.map((conversation) => ({ id: conversation.id, title: "Assistant conversation", at: conversation.createdAt.toISOString() })),
    },
  }
}
