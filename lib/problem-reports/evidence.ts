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
 *
 * @module
 */

import "server-only"

import { readHistory } from "@/lib/connections/tautulli-history"
import { getActiveService } from "@/lib/data/active-service"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("PROBLEM_REPORT_EVIDENCE")

/** Plays of a title read to see whether it has played to the end. */
const TITLE_PLAYS = 50

/** The reporter's last play of the title. */
export interface LastPlay {
  player: string | null
  transcoded: boolean
  at: string
}

/** What a report records about how the title played. */
export interface Evidence {
  lastPlay: LastPlay | null
  /** Played to the end for anyone since its file was added; `null` when Tautulli couldn't say. */
  playedToEnd: boolean | null
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
export async function tautulliUserIdOf(userId: string): Promise<number | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plexUserId: true } })
  return user?.plexUserId && /^\d{1,15}$/.test(user.plexUserId) ? Number(user.plexUserId) : null
}

async function lastPlay(config: { url: string; apiKey: string }, userId: string, ratingKey: string): Promise<LastPlay | null> {
  const tautulliUserId = await tautulliUserIdOf(userId)
  if (tautulliUserId === null) return null
  const [play] = (await readHistory(config, { user_id: tautulliUserId, rating_key: ratingKey, length: 1 })) ?? []
  return play ? { player: play.player ?? null, transcoded: play.transcoded, at: play.playedAt.toISOString() } : null
}

/** The member's last play of a title, or `null`. */
export async function memberLastPlay(userId: string, ratingKey: string): Promise<LastPlay | null> {
  try {
    const config = await activeTautulli()
    return config ? await lastPlay(config, userId, ratingKey) : null
  } catch (error) {
    logger.error("Could not read the member's last play", error, { ratingKey })
    return null
  }
}

/**
 * The evidence a report records.
 *
 * @param item - The title; `addedAt` (seconds) limits "played to the end" to its current file
 */
export async function readEvidence(userId: string, item: { ratingKey: string; addedAt?: number }): Promise<Evidence> {
  try {
    const config = await activeTautulli()
    if (!config) return { lastPlay: null, playedToEnd: null }
    const [last, plays] = await Promise.all([
      lastPlay(config, userId, item.ratingKey),
      readHistory(config, { rating_key: item.ratingKey, length: TITLE_PLAYS }),
    ])
    const since = (item.addedAt ?? 0) * 1000
    return { lastPlay: last, playedToEnd: plays ? plays.some((play) => play.watched && play.playedAt.getTime() >= since) : null }
  } catch (error) {
    logger.error("Could not read a report's evidence", error, { ratingKey: item.ratingKey })
    return { lastPlay: null, playedToEnd: null }
  }
}
