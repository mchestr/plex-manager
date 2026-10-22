/**
 * A member's activity timeline (GAP-38), keyset-paged across two sources:
 * Discord commands (`DiscordCommandLog.createdAt`) and media marks
 * (`UserMediaMark.markedAt`).
 *
 * ## Order and cursor
 *
 * Items sort by `(timestamp desc, source asc, id desc)`, where `source` is
 * `discord_command` or `media_mark`. The cursor is base64url JSON
 * `{ ts, source, id }` naming the last item of a page.
 *
 * ## Paging
 *
 * 1. Each source is read in its own order (`time desc, id desc`) with
 *    `take: pageSize + 1` and a `where` that keeps only rows after the cursor
 *    in the merged order. On equal timestamps a source that sorts before the
 *    cursor's has no rows left; the cursor's own source continues below its
 *    id; a later source keeps every row at that timestamp.
 * 2. The two reads are merged, the first `pageSize` items are the page, and
 *    the next cursor is the page's last item when anything is left.
 * 3. The total comes from the two counts, so "Showing 30 of 47" holds on
 *    every page.
 *
 * @module lib/admin/activity-timeline
 */

import "server-only"

import { z } from "zod"

import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import type { DiscordCommandActivity, MediaMarkActivity, UserActivityItem, UserActivityTimelineData } from "@/types/admin"

type Source = UserActivityItem["type"]

const cursorSchema = z.object({
  ts: z.iso.datetime(),
  source: z.enum(["discord_command", "media_mark"]),
  id: z.string().min(1).max(64),
})

interface Cursor {
  ts: Date
  source: Source
  id: string
}

function encodeActivityCursor(item: Pick<UserActivityItem, "timestamp" | "type" | "id">): string {
  const json = JSON.stringify({ ts: item.timestamp.toISOString(), source: item.type, id: item.id })
  return Buffer.from(json, "utf8").toString("base64url")
}

/** The cursor, or null when it is not one this module wrote. */
export function decodeActivityCursor(value: string): Cursor | null {
  let json: unknown
  try {
    json = JSON.parse(Buffer.from(value, "base64url").toString("utf8"))
  } catch {
    return null
  }
  const parsed = cursorSchema.safeParse(json)
  return parsed.success ? { ...parsed.data, ts: new Date(parsed.data.ts) } : null
}

/** The merged order: newest first, then source, then id descending. */
function compare(a: UserActivityItem, b: UserActivityItem): number {
  const byTime = b.timestamp.getTime() - a.timestamp.getTime()
  if (byTime !== 0) return byTime
  if (a.type !== b.type) return a.type < b.type ? -1 : 1
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

type TimeFilter = { lt: Date } | { lte: Date }

/**
 * How one source's rows after `cursor` are kept: by time alone, or (the
 * cursor's own source) by time with the id tie-break. Null on the first page.
 */
function afterCursor(source: Source, cursor: Cursor | null): { time: TimeFilter; tie?: { ts: Date; id: string } } | null {
  if (!cursor) return null
  if (source < cursor.source) return { time: { lt: cursor.ts } }
  if (source > cursor.source) return { time: { lte: cursor.ts } }
  return { time: { lt: cursor.ts }, tie: { ts: cursor.ts, id: cursor.id } }
}

function discordWhere(userId: string, cursor: Cursor | null): Prisma.DiscordCommandLogWhereInput {
  const after = afterCursor("discord_command", cursor)
  if (!after) return { userId }
  if (!after.tie) return { userId, createdAt: after.time }
  return { userId, OR: [{ createdAt: after.time }, { createdAt: after.tie.ts, id: { lt: after.tie.id } }] }
}

function markWhere(userId: string, cursor: Cursor | null): Prisma.UserMediaMarkWhereInput {
  const after = afterCursor("media_mark", cursor)
  if (!after) return { userId }
  if (!after.tie) return { userId, markedAt: after.time }
  return { userId, OR: [{ markedAt: after.time }, { markedAt: after.tie.ts, id: { lt: after.tie.id } }] }
}

function toDiscord(log: Prisma.DiscordCommandLogGetPayload<object>): DiscordCommandActivity {
  return {
    type: "discord_command",
    id: log.id,
    timestamp: log.createdAt,
    commandType: log.commandType,
    commandName: log.commandName,
    commandArgs: log.commandArgs,
    argsLength: log.argsLength,
    status: log.status,
    responseTimeMs: log.responseTimeMs,
    channelType: log.channelType,
  }
}

function toMark(mark: Prisma.UserMediaMarkGetPayload<object>): MediaMarkActivity {
  return {
    type: "media_mark",
    id: mark.id,
    timestamp: mark.markedAt,
    markType: mark.markType,
    mediaType: mark.mediaType,
    title: mark.title,
    year: mark.year,
    seasonNumber: mark.seasonNumber,
    episodeNumber: mark.episodeNumber,
    parentTitle: mark.parentTitle,
    markedVia: mark.markedVia,
  }
}

/** One page of `userId`'s timeline after `cursor` (null for the first page). */
export async function loadActivityTimeline(
  userId: string,
  { cursor, pageSize }: { cursor: Cursor | null; pageSize: number }
): Promise<UserActivityTimelineData> {
  const [logs, marks, discordCount, markCount] = await Promise.all([
    prisma.discordCommandLog.findMany({
      where: discordWhere(userId, cursor),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
    }),
    prisma.userMediaMark.findMany({
      where: markWhere(userId, cursor),
      orderBy: [{ markedAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
    }),
    prisma.discordCommandLog.count({ where: { userId } }),
    prisma.userMediaMark.count({ where: { userId } }),
  ])

  const merged = [...logs.map(toDiscord), ...marks.map(toMark)].sort(compare)
  const items = merged.slice(0, pageSize)
  const last = items[items.length - 1]
  return {
    items,
    total: discordCount + markCount,
    nextCursor: merged.length > pageSize && last ? encodeActivityCursor(last) : null,
  }
}
