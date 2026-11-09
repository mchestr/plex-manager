/**
 * The daily last seen read: each member's newest play from Tautulli onto
 * `User.lastSeenAt`, and `User.lastSeenReadAt` stamped for every member the
 * read found.
 *
 * ## Rules
 *
 * | Case                                        | Write                                         |
 * |---------------------------------------------|-----------------------------------------------|
 * | Tautulli row for the member, history kept   | `lastSeenAt` = the later of stored and read; `lastSeenReadAt` = now |
 * | The same, and a session open right now      | `lastSeenAt` = the later of stored and now; `lastSeenReadAt` = now |
 * | Tautulli keeps no history for the member    | nothing, so the sweep sees them as not read   |
 * | No Tautulli row for the member              | nothing                                       |
 *
 * ## Open plays
 *
 * Tautulli adds a play to its history only when the session stops, so a
 * member who is still playing, or left a play paused, would look as if they
 * had not played. The read also asks for the sessions open right now
 * (`listTautulliPlayingUsers`) and counts each member with one as seen at
 * `now`, but only a member whose history Tautulli keeps: the others stay not
 * read, which already holds their removal.
 *
 * The open plays are read before the history. A play that stops after the
 * open-play read is in the history read that follows, and a play still open
 * then is in the open-play read, so no play falls between the two reads.
 *
 * The open-play read can only make a member count as active. When it fails,
 * the read logs `inactivity.activity_failed`, writes the history alone and
 * returns `activityRead: false`. The sweep then removes no one in that run
 * (`activity_failed`), since a member who is still playing cannot be told
 * apart from one who is not.
 *
 * `lastSeenAt` never moves backwards, so a play an earlier read stored stays
 * when Tautulli loses it. Members match by plex.tv account id (`user_id` =
 * the trimmed `plexUserId`), never by name. A play dated after `now` (a
 * wrong clock on the Tautulli host) is stored as `now`: a date in the future
 * would never be replaced by later real plays.
 *
 * Two dates go to the sweep's guards:
 *
 * - `newestPlayAt`, the newest play on the whole server, shows that Tautulli
 *   still records plays. A play dated after `now` does not count, and
 *   neither does an open session: this guard reads the history only.
 * - `oldestPlayAt`, when Tautulli's history starts (`getOldestPlay`), shows
 *   how far back a missing play means anything. A failed read of it is
 *   logged and gives null, which blocks removals but not the read.
 *
 * @module lib/inactivity/sync
 */

import "server-only"

import { getOldestPlay, listTautulliLastSeen, listTautulliPlayingUsers } from "@/lib/connections/tautulli-last-seen"
import { getActiveService } from "@/lib/data/active-service"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("INACTIVITY_SYNC")

/** Member updates per transaction. @internal */
export const SYNC_CHUNK = 100

export type SyncLastSeenResult =
  | {
      ok: true
      /** Tautulli users read. */
      tautulliUsers: number
      /** Members whose last seen was read. */
      matched: number
      /** The newest play on the whole server; null when Tautulli has none. */
      newestPlayAt: Date | null
      /** When Tautulli's history starts; null when it has none or the read failed. */
      oldestPlayAt: Date | null
      /** Whether Tautulli listed its open plays; when it did not, the sweep removes no one. */
      activityRead: boolean
    }
  | { ok: false; code: string }

const later = (a: Date | null, b: Date | null) => (!a || (b && b > a) ? b : a)

/** Reads last seen from the active Tautulli and writes it onto the members it finds. Throws only on a database error. */
export async function syncLastSeen({ now, signal }: { now: Date; signal?: AbortSignal }): Promise<SyncLastSeenResult> {
  const tautulli = await getActiveService("tautulli")
  if (!tautulli) return { ok: false, code: "NO_TAUTULLI" }

  // The open plays first, so a play that stops between the two reads is in the history (see Open plays)
  const open = await listTautulliPlayingUsers(tautulli, { signal })
  if (!open.ok) logger.warn("inactivity.activity_failed", { code: open.code, status: open.status })
  const playingNow = new Set(open.ok ? open.data.userIds.map(String) : [])

  const read = await listTautulliLastSeen(tautulli, { signal })
  if (!read.ok) {
    logger.warn("inactivity.sync_failed", { code: read.code, status: read.status })
    return { ok: false, code: read.code }
  }

  const oldest = await getOldestPlay(tautulli, { signal })
  if (!oldest.ok) logger.warn("inactivity.oldest_play_failed", { code: oldest.code, status: oldest.status })
  const oldestPlayAt = oldest.ok ? oldest.data : null

  const { rows, dropped } = read.data
  const byPlexUserId = new Map(rows.map((row) => [String(row.userId), row]))
  const newestPlayAt = rows.reduce<Date | null>((newest, row) => (row.lastSeen && row.lastSeen <= now ? later(newest, row.lastSeen) : newest), null)

  const members = await prisma.user.findMany({
    where: { plexUserId: { not: null } },
    select: { id: true, plexUserId: true, lastSeenAt: true },
  })
  let playing = 0
  const updates = members.flatMap((member) => {
    const plexUserId = member.plexUserId!.trim()
    const row = byPlexUserId.get(plexUserId)
    if (!row?.keepHistory) return []
    const isPlaying = playingNow.has(plexUserId)
    if (isPlaying) playing++
    const played = isPlaying || (row.lastSeen && row.lastSeen > now) ? now : row.lastSeen
    // updateMany: a member removed since the read is skipped, not an error
    return [
      prisma.user.updateMany({
        where: { id: member.id },
        data: { lastSeenAt: later(member.lastSeenAt, played), lastSeenReadAt: now },
      }),
    ]
  })
  for (let i = 0; i < updates.length; i += SYNC_CHUNK) {
    await prisma.$transaction(updates.slice(i, i + SYNC_CHUNK))
  }

  logger.info("inactivity.synced", {
    tautulliUsers: rows.length,
    matched: updates.length,
    dropped,
    playing,
    sessionsDropped: open.ok ? open.data.dropped : null,
  })
  return { ok: true, tautulliUsers: rows.length, matched: updates.length, newestPlayAt, oldestPlayAt, activityRead: open.ok }
}
