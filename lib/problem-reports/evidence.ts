/**
 * What a report knows about how a title played, from Tautulli: the
 * reporter's last play of it (the player, whether Plex converted the video,
 * when), and whether it has played to the end for anyone since its file was
 * added. The sheet asks "Does anything else play on {player}?" from the
 * first; the decision a later step makes reads both.
 *
 * Only these fields are kept. Tautulli's IP address and device id are never
 * read (`readHistory`), so they can't be stored. Every read fails soft: a
 * missing Tautulli, member or play is `null`, and a report is saved anyway.
 * The member waits on these reads, so each is tried once, with a short
 * timeout.
 *
 * @module
 */

import "server-only"

import { readHistory } from "@/lib/connections/tautulli-history"
import { getActiveService } from "@/lib/data/active-service"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("PROBLEM_REPORT_EVIDENCE")

/**
 * Plays of a title read to see whether it has played to the end: its newest
 * ones, so a busy title with many partial plays can read `false` while an
 * older full play exists.
 */
const TITLE_PLAYS = 50

/** History reads a member waits on: one short try, since evidence is best-effort. */
const WAITING = { timeoutMs: 3000, attempts: 1 }

/** The reporter's last play of the title. */
export interface LastPlay {
  player: string | null
  transcoded: boolean
  at: string
}

/** What a report records about how the title played. */
export interface Evidence {
  lastPlay: LastPlay | null
  /** Played to the end for anyone since its file was added; `null` when Tautulli couldn't say, or for a show, which has no file. */
  playedToEnd: boolean | null
}

/** A title as the evidence reads it. */
interface Title {
  ratingKey: string
  type: string
  /** When its file was added, in seconds. */
  addedAt?: number
}

async function activeTautulli() {
  const row = await getActiveService("tautulli")
  return row ? { url: row.url, apiKey: row.apiKey } : null
}

/**
 * The member's Tautulli `user_id`: Tautulli keys users by their plex.tv
 * account id, which is the member's `plexUserId` (as `matchTautulliUser`
 * relies on). `null` without a numeric Plex id.
 */
export function tautulliUserIdOf(plexUserId: string | null | undefined): number | null {
  return plexUserId && /^\d{1,15}$/.test(plexUserId) ? Number(plexUserId) : null
}

/** `get_history`'s filter for a title: `rating_key` matches the played item, so a show is read by its episodes' `grandparent_rating_key`. */
const playsOf = (title: Title) => (title.type === "show" ? { grandparent_rating_key: title.ratingKey } : { rating_key: title.ratingKey })

async function lastPlay(config: { url: string; apiKey: string }, tautulliUserId: number | null, title: Title): Promise<LastPlay | null> {
  if (tautulliUserId === null) return null
  const [play] = (await readHistory(config, { user_id: tautulliUserId, ...playsOf(title), length: 1 }, WAITING)) ?? []
  return play ? { player: play.player ?? null, transcoded: play.transcoded, at: play.playedAt.toISOString() } : null
}

/** The evidence a report records. `addedAt` limits "played to the end" to the title's current file. */
export async function readEvidence(userId: string, title: Title): Promise<Evidence> {
  try {
    const config = await activeTautulli()
    if (!config) return { lastPlay: null, playedToEnd: null }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { plexUserId: true } })
    const tautulliUserId = tautulliUserIdOf(user?.plexUserId)
    if (title.type === "show") return { lastPlay: await lastPlay(config, tautulliUserId, title), playedToEnd: null }
    const [last, plays] = await Promise.all([
      lastPlay(config, tautulliUserId, title),
      readHistory(config, { rating_key: title.ratingKey, length: TITLE_PLAYS }, WAITING),
    ])
    const since = (title.addedAt ?? 0) * 1000
    return { lastPlay: last, playedToEnd: plays ? plays.some((play) => play.watched && play.playedAt.getTime() >= since) : null }
  } catch (error) {
    logger.error("Could not read a report's evidence", error, { ratingKey: title.ratingKey })
    return { lastPlay: null, playedToEnd: null }
  }
}
