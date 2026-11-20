/**
 * The titles `/report` offers without a search: what the member is watching
 * now (their own Plex sessions, read the way `/watching` reads them), and
 * what they watched recently (their Tautulli history, newest first, one row
 * per movie or show). Only titles in libraries shared with the member, and
 * `null` when Plex or Tautulli can't be read, so the rest of the page still
 * loads.
 *
 * @module lib/member/problem-report-titles
 */

import "server-only"

import { z } from "zod"

import { getPlexSessions } from "@/lib/connections/plex"
import type { PlexServerConfig } from "@/lib/connections/plex-config"
import { matchesSessionUser } from "@/lib/connections/plex-sessions"
import { readHistory } from "@/lib/connections/tautulli-history"
import { getActiveService } from "@/lib/data/active-service"
import { inLibraries, type LibraryAccess } from "@/lib/problem-reports/access"
import { tautulliUserIdOf } from "@/lib/problem-reports/evidence"
import type { ReportableType } from "@/lib/problem-reports/taxonomy"
import { reportTitle } from "@/lib/problem-reports/title"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("PROBLEM_REPORT_TITLES")

/**
 * Plays read for Recently watched, and rows shown. Plays outside the
 * member's libraries, and a binge of one show, use up the window, so it can
 * show fewer rows than the limit.
 */
const HISTORY_PLAYS = 100
const RECENT_LIMIT = 12

/** A title the member may report, with the rating key of its poster (a show's, for an episode). */
export interface TitleResult {
  ratingKey: string
  type: ReportableType
  title: string
  posterKey: string
}

const key = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).transform(String)
const sessionSchema = z.looseObject({
  ratingKey: key,
  type: z.string(),
  title: z.string().catch(""),
  year: z.number().int().optional().catch(undefined),
  grandparentTitle: z.string().optional().catch(undefined),
  grandparentRatingKey: key.optional().catch(undefined),
  parentIndex: z.number().int().optional().catch(undefined),
  index: z.number().int().optional().catch(undefined),
  librarySectionID: key.optional().catch(undefined),
  User: z.looseObject({ id: z.union([z.string(), z.number()]).optional() }).optional().catch(undefined),
})
const sessionsSchema = z.looseObject({ MediaContainer: z.looseObject({ Metadata: z.array(z.unknown()).optional() }).optional() })

const isReportable = (type: string): type is ReportableType => type === "movie" || type === "show" || type === "episode"

type Session = z.infer<typeof sessionSchema>

/** The session's Plex user, in the shape `matchesSessionUser` reads. */
const sessionUser = (session: Session) => ({ User: session.User ? { id: session.User.id === undefined ? undefined : String(session.User.id) } : undefined })

async function readWatching(server: PlexServerConfig, viewer: { plexUserId: string; isOwner: boolean }, access: LibraryAccess): Promise<TitleResult[] | null> {
  const result = await getPlexSessions(server)
  const parsed = sessionsSchema.safeParse(result.data)
  if (!result.success || !parsed.success) return null
  const titles = new Map<string, TitleResult>()
  for (const raw of parsed.data.MediaContainer?.Metadata ?? []) {
    const session = sessionSchema.safeParse(raw)
    if (!session.success) continue
    const s = session.data
    if (!isReportable(s.type) || !matchesSessionUser(sessionUser(s), viewer)) continue
    if (!inLibraries(access, s.librarySectionID) || titles.has(s.ratingKey)) continue
    titles.set(s.ratingKey, {
      ratingKey: s.ratingKey,
      type: s.type,
      title: reportTitle({ title: s.title, year: s.year, showTitle: s.grandparentTitle, seasonNumber: s.parentIndex, episodeNumber: s.index }),
      posterKey: s.grandparentRatingKey ?? s.ratingKey,
    })
  }
  return [...titles.values()]
}

/** The member's own streams on the server now. */
export async function watchingNow(
  server: PlexServerConfig,
  member: { plexUserId: string | null; isOwner: boolean },
  access: LibraryAccess
): Promise<TitleResult[] | null> {
  if (!member.plexUserId) return []
  try {
    return await readWatching(server, { plexUserId: member.plexUserId, isOwner: member.isOwner }, access)
  } catch (error) {
    logger.error("Could not read the member's streams", error)
    return null
  }
}

/**
 * The member's recent plays, newest first: one row per movie, and one per
 * show (its newest episode).
 *
 * @param plexUserId - The member's Plex account id, which Tautulli keys them by
 */
export async function recentlyWatched(plexUserId: string | null, access: LibraryAccess): Promise<TitleResult[] | null> {
  const tautulliUserId = tautulliUserIdOf(plexUserId)
  if (tautulliUserId === null) return []
  try {
    const row = await getActiveService("tautulli")
    if (!row) return null
    const config = { url: row.url, apiKey: row.apiKey }
    const plays = await readHistory(config, { user_id: tautulliUserId, length: HISTORY_PLAYS })
    if (!plays) return null
    const titles = new Map<string, TitleResult>()
    for (const play of plays) {
      const group = play.grandparentRatingKey ?? play.ratingKey
      if (!isReportable(play.mediaType) || titles.has(group) || !inLibraries(access, play.sectionId)) continue
      titles.set(group, { ratingKey: play.ratingKey, type: play.mediaType, title: reportTitle(play), posterKey: group })
    }
    return [...titles.values()].slice(0, RECENT_LIMIT)
  } catch (error) {
    logger.error("Could not read the member's recent plays", error)
    return null
  }
}
