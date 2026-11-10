/**
 * What `/report` shows a member: what they are watching now and watched
 * recently (`./problem-report-titles`), a title search filtered to the
 * libraries shared with them, their reports and the ones they follow
 * (`./your-reports`), and the title whose sheet is open, with their last
 * play of it. Every title is checked against the member's libraries on the
 * server (SEC-21).
 *
 * @module lib/member/problem-reports
 */

import "server-only"

import { getPlexShowEpisodes } from "@/lib/connections/plex"
import { getActivePlexServerConfig, type PlexServerConfig } from "@/lib/connections/plex-config"
import { getActiveService } from "@/lib/data/active-service"
import type { ProblemReportStatus } from "@/lib/generated/prisma/client"
import { memberStatuses } from "@/lib/member/dry-runs"
import { recentlyWatched, watchingNow, type TitleResult } from "@/lib/member/problem-report-titles"
import { listMemberReports, type ReportRow } from "@/lib/member/your-reports"
import { prisma } from "@/lib/prisma"
import { memberLibraryAccess, readMemberItem, type LibraryAccess } from "@/lib/problem-reports/access"
import { readEvidence, type LastPlay } from "@/lib/problem-reports/evidence"
import { memberFixesFor } from "@/lib/problem-reports/member-swap"
import type { SwapOffer } from "@/lib/problem-reports/member-swap-words"
import { searchMemberTitles } from "@/lib/problem-reports/search"
import { problemLabel, type ReportableType } from "@/lib/problem-reports/taxonomy"
import { reportTitle, titleKeyOf } from "@/lib/problem-reports/title"
import { getFormat } from "@/lib/settings/app-settings"

const RESULT_LIMIT = 20
const MIN_QUERY = 2

const UNAVAILABLE = "We can't reach the server right now. Try again in a few minutes."
const NOT_IN_LIBRARIES = "We couldn't find that title in your libraries."

/** The title whose sheet is open. */
export interface SelectedTitle {
  ratingKey: string
  type: ReportableType
  title: string
  /** A show's episodes to choose from, when the server listed them. */
  episodes: { ratingKey: string; label: string }[] | null
  /** The title's open report, when there is one. */
  openReport: { id: string; problem: string; status: ProblemReportStatus; since: string; yours: boolean } | null
  /** The member's last play of it, which names the player the sheet asks about. */
  lastPlay: LastPlay | null
  /** It played to the end for anyone since its file was added; `null` when Tautulli couldn't say. */
  playedToEnd: boolean | null
  /** Which fixers are set up, for what the send button says (`consequence`). */
  fixers: { radarr: boolean; sonarr: boolean }
  /** Members' swaps as the gate decides them for this title now, while they're On (`memberFixesFor`). */
  swap: SwapOffer | null
  /** A different title playing is fixed on its own. */
  matchFixes: boolean
}

export interface ReportPageData {
  reports: ReportRow[]
  /** The member's own streams; `null` when Plex can't be read. */
  watching: TitleResult[] | null
  /** One row per recently watched movie or show; `null` when Tautulli can't be read. */
  recent: TitleResult[] | null
  search: { results: TitleResult[]; error: string | null } | null
  selected: SelectedTitle | { error: string } | null
}

async function searchTitles(server: PlexServerConfig | null, access: LibraryAccess | null, query: string): Promise<NonNullable<ReportPageData["search"]>> {
  const results = server && access ? await searchMemberTitles(server, access, query, RESULT_LIMIT) : null
  return results ? { results, error: null } : { results: [], error: UNAVAILABLE }
}

async function selectTitle(userId: string, ratingKey: string): Promise<NonNullable<ReportPageData["selected"]>> {
  const member = await readMemberItem(userId, ratingKey)
  if (!member.ok) return { error: member.reason === "UNAVAILABLE" ? UNAVAILABLE : NOT_IN_LIBRARIES }
  const { item, server } = member
  const [episodes, open, evidence, sonarr, radarr] = await Promise.all([
    item.type === "show" ? getPlexShowEpisodes(server, item.ratingKey) : null,
    prisma.problemReport.findUnique({
      where: { activeKey: titleKeyOf(item) },
      select: { id: true, reporterId: true, problem: true, status: true, updatedAt: true, events: { where: { kind: "ALSO_REPORTED", actorUserId: userId }, select: { id: true }, take: 1 } },
    }),
    readEvidence(userId, item),
    getActiveService("sonarr"),
    getActiveService("radarr"),
  ])
  const f = await getFormat()
  const [fixes, statuses] = await Promise.all([
    memberFixesFor({ userId, item, server, lastPlay: evidence.lastPlay }, (day) => f.date(day, "day-month-short"), new Date()),
    memberStatuses(open ? [open] : []),
  ])
  return {
    ratingKey: item.ratingKey,
    type: item.type as ReportableType,
    title: reportTitle(item),
    episodes: episodes?.ok
      ? episodes.episodes.map((episode) => ({ ratingKey: episode.ratingKey, label: `S${episode.seasonNumber}E${episode.episodeNumber}: ${episode.title}` }))
      : null,
    openReport: open
      ? { id: open.id, problem: problemLabel(open.problem), status: statuses.get(open.id) ?? open.status, since: open.updatedAt.toISOString(), yours: open.reporterId === userId || open.events.length > 0 }
      : null,
    lastPlay: evidence.lastPlay,
    playedToEnd: evidence.playedToEnd,
    fixers: { radarr: radarr !== null, sonarr: sonarr !== null },
    ...fixes,
  }
}

/**
 * The page's data for a member.
 *
 * @param userId - The signed-in member
 * @param params - `q`, a title search (2 characters or more), and `item`, the title whose sheet is open
 */
export async function getReportPageData(userId: string, params: { q?: string; item?: string }): Promise<ReportPageData> {
  const query = params.q && params.q.length >= MIN_QUERY ? params.q : null
  const [server, user] = await Promise.all([
    getActivePlexServerConfig(),
    prisma.user.findUnique({ where: { id: userId }, select: { plexUserId: true } }),
  ])
  const access = server ? await memberLibraryAccess(userId, server) : null
  const plexUserId = user?.plexUserId ?? null
  const member = { plexUserId, isOwner: !!server && plexUserId === server.adminPlexUserId }
  const [reports, watching, recent, search, selected] = await Promise.all([
    listMemberReports(userId),
    server && access ? watchingNow(server, member, access) : null,
    access ? recentlyWatched(plexUserId, access) : null,
    query ? searchTitles(server, access, query) : null,
    params.item ? selectTitle(userId, params.item) : null,
  ])
  return { reports, watching, recent, search, selected }
}
