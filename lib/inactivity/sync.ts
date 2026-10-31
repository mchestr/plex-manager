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
 * | Tautulli keeps no history for the member    | nothing, so the sweep sees them as not read   |
 * | No Tautulli row for the member              | nothing                                       |
 *
 * `lastSeenAt` never moves backwards, so a Tautulli that lost history cannot
 * make an active member look inactive. Members match by plex.tv account id
 * (`user_id` = the trimmed `plexUserId`), never by name.
 *
 * `newestPlayAt` is the newest play on the whole server, for the sweep's
 * freshness guard. A play dated after `now` (a wrong clock on the Tautulli
 * host) does not count: it cannot prove Tautulli is still recording.
 *
 * @module lib/inactivity/sync
 */

import "server-only"

import { listTautulliLastSeen } from "@/lib/connections/tautulli-last-seen"
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
    }
  | { ok: false; code: string }

const later = (a: Date | null, b: Date | null) => (!a || (b && b > a) ? b : a)

/** Reads last seen from the active Tautulli and writes it onto the members it finds. Throws only on a database error. */
export async function syncLastSeen({ now, signal }: { now: Date; signal?: AbortSignal }): Promise<SyncLastSeenResult> {
  const tautulli = await getActiveService("tautulli")
  if (!tautulli) return { ok: false, code: "NO_TAUTULLI" }

  const read = await listTautulliLastSeen(tautulli, { signal })
  if (!read.ok) {
    logger.warn("inactivity.sync_failed", { code: read.code, status: read.status })
    return { ok: false, code: read.code }
  }

  const { rows, dropped } = read.data
  const byPlexUserId = new Map(rows.map((row) => [String(row.userId), row]))
  const newestPlayAt = rows.reduce<Date | null>((newest, row) => (row.lastSeen && row.lastSeen <= now ? later(newest, row.lastSeen) : newest), null)

  const members = await prisma.user.findMany({
    where: { plexUserId: { not: null } },
    select: { id: true, plexUserId: true, lastSeenAt: true },
  })
  const updates = members.flatMap((member) => {
    const row = byPlexUserId.get(member.plexUserId!.trim())
    if (!row?.keepHistory) return []
    // updateMany: a member removed since the read is skipped, not an error
    return [
      prisma.user.updateMany({
        where: { id: member.id },
        data: { lastSeenAt: later(member.lastSeenAt, row.lastSeen), lastSeenReadAt: now },
      }),
    ]
  })
  for (let i = 0; i < updates.length; i += SYNC_CHUNK) {
    await prisma.$transaction(updates.slice(i, i + SYNC_CHUNK))
  }

  logger.info("inactivity.synced", { tautulliUsers: rows.length, matched: updates.length, dropped })
  return { ok: true, tautulliUsers: rows.length, matched: updates.length, newestPlayAt }
}
