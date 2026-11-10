/**
 * The For you titles and the date groups of one member (TS 13.3 steps 2 to
 * 5). Server-only: it reads Leaving soon, the newest library data and the
 * member's own watchlist.
 *
 * 1. The visible Leaving soon titles in the budget order (`readVisibleItems`).
 * 2. Each title's reason from the member's own facts in the newest snapshot
 *    (`memberReason`). A title that is not in the library data has none.
 * 3. While G8 is off, the member's watchlist rows that are still on the
 *    watchlist. With G8 on, no watchlist read.
 * 4. `kept`: the member holds an active Keep of the title.
 * 5. The split by today in the server zone (`splitMemberItems`).
 *
 * @module lib/cleanup/member/list
 */

import "server-only"

import { today } from "@/lib/cleanup/settings"
import type { ForYouItem, MemberLeavingGroup } from "@/lib/cleanup/types/member"
import { prisma } from "@/lib/prisma"

import type { OpenGate } from "./gate"
import { splitMemberItems } from "./groups"
import { readVisibleItems, snapshotItemOf } from "./items"
import { memberReason, type WatchlistEntry, watchlistIndex } from "./reasons"

function readWatchlist(userId: string): Promise<WatchlistEntry[]> {
  return prisma.watchlistSyncHistory.findMany({
    where: { userId, status: { not: "REMOVED_FROM_WATCHLIST" } },
    select: { mediaType: true, tmdbId: true, tvdbId: true, imdbId: true, syncedAt: true },
  })
}

/**
 * The member's list: For you first, then the date groups, the due group first.
 *
 * @param gate - The open gate of the member (its access, plex.tv id and options)
 * @param input.userId - The member's app user id (for the watchlist)
 * @param input.activeKeys - The item keys of the member's active Keeps
 * @param input.now - The instant that decides which titles are due
 */
export async function readMemberList(
  gate: OpenGate,
  { userId, activeKeys, now }: { userId: string; activeKeys: ReadonlySet<string>; now: Date }
): Promise<{ forYou: ForYouItem[]; groups: MemberLeavingGroup[] }> {
  const watchlistOn = !gate.options.protections.g8.enabled
  const [{ rows, snapshot }, watchlistRows, day] = await Promise.all([
    readVisibleItems(gate.access),
    watchlistOn ? readWatchlist(userId) : Promise.resolve([]),
    today(now),
  ])
  const watchlist = watchlistOn ? watchlistIndex(watchlistRows) : null
  const entries = rows.map((row) => {
    const item = snapshotItemOf(row, snapshot)
    return { row, reason: item ? memberReason(item, gate.plexUserId, watchlist) : null, kept: activeKeys.has(row.itemKey) }
  })
  return splitMemberItems(entries, day)
}
