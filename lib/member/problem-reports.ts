/**
 * What `/report` shows a member: their reports (and the ones they follow), a
 * title search filtered to the libraries shared with them, and the title
 * whose sheet is open. Every title is checked against the member's libraries
 * on the server (SEC-21).
 *
 * @module lib/member/problem-reports
 */

import "server-only"

import { getPlexShowEpisodes, searchPlexMedia } from "@/lib/connections/plex"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import type { ProblemReportStatus } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { inLibraries, memberLibraryAccess, readMemberItem } from "@/lib/problem-reports/access"
import { problemLabel, type ReportableType } from "@/lib/problem-reports/taxonomy"
import { reportTitle, titleKeyOf } from "@/lib/problem-reports/title"
import { closedEventDataSchema } from "@/lib/validations/problem-reports"

const REPORT_LIMIT = 50
const RESULT_LIMIT = 20
const MIN_QUERY = 2
const CANCELLABLE: ReadonlySet<ProblemReportStatus> = new Set(["SENT", "WITH_ADMIN"])

const UNAVAILABLE = "We can't reach the server right now. Try again in a few minutes."
const NOT_IN_LIBRARIES = "We couldn't find that title in your libraries."

/** One of the member's reports, or one they follow. */
export interface ReportRow {
  id: string
  title: string
  problem: string
  status: ProblemReportStatus
  /** The latest event in words, and when: "You sent it", "You cancelled it", "You're following it". */
  latest: { words: string; at: string }
  canCancel: boolean
}

/** A search result the member may report. */
interface TitleResult {
  ratingKey: string
  type: ReportableType
  title: string
}

/** The title whose sheet is open. */
export interface SelectedTitle {
  ratingKey: string
  type: ReportableType
  title: string
  /** A show's episodes to choose from, when the server listed them. */
  episodes: { ratingKey: string; label: string }[] | null
  /** The title's open report, when there is one. */
  openReport: { id: string; problem: string; status: ProblemReportStatus; since: string; yours: boolean } | null
}

export interface ReportPageData {
  reports: ReportRow[]
  search: { results: TitleResult[]; error: string | null } | null
  selected: SelectedTitle | { error: string } | null
}

const isReportable = (type: string): type is ReportableType => type === "movie" || type === "show" || type === "episode"

async function listReports(userId: string): Promise<ReportRow[]> {
  const rows = await prisma.problemReport.findMany({
    where: { OR: [{ reporterId: userId }, { events: { some: { kind: "ALSO_REPORTED", actorUserId: userId } } }] },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: REPORT_LIMIT,
    select: {
      id: true, reporterId: true, problem: true, status: true, title: true, year: true, showTitle: true, seasonNumber: true,
      episodeNumber: true, createdAt: true,
      events: {
        where: { OR: [{ kind: "CLOSED" }, { kind: "ALSO_REPORTED", actorUserId: userId }] },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { kind: true, data: true, createdAt: true },
      },
    },
  })
  return rows.map((row) => {
    const own = row.reporterId === userId
    const event = row.events[0]
    const cancelled = event?.kind === "CLOSED" && closedEventDataSchema.safeParse(event.data).success
    const words = cancelled ? (own ? "You cancelled it" : "Cancelled") : own ? "You sent it" : "You're following it"
    return {
      id: row.id,
      title: reportTitle(row),
      problem: problemLabel(row.problem),
      status: row.status,
      latest: { words, at: (event?.createdAt ?? row.createdAt).toISOString() },
      canCancel: own && CANCELLABLE.has(row.status),
    }
  })
}

async function searchTitles(userId: string, query: string): Promise<NonNullable<ReportPageData["search"]>> {
  const server = await getActivePlexServerConfig()
  if (!server) return { results: [], error: UNAVAILABLE }
  const [found, access] = await Promise.all([searchPlexMedia(server, query), memberLibraryAccess(userId, server)])
  if (!found.success || access === null) return { results: [], error: UNAVAILABLE }
  const results = (found.data ?? []).flatMap((item) =>
    isReportable(item.type) && inLibraries(access, item.librarySectionId)
      ? [{ ratingKey: item.ratingKey, type: item.type, title: reportTitle({ ...item, showTitle: item.grandparentTitle, seasonNumber: item.parentIndex, episodeNumber: item.index }) }]
      : []
  )
  return { results: results.slice(0, RESULT_LIMIT), error: null }
}

async function selectTitle(userId: string, ratingKey: string): Promise<NonNullable<ReportPageData["selected"]>> {
  const member = await readMemberItem(userId, ratingKey)
  if (!member.ok) return { error: member.reason === "UNAVAILABLE" ? UNAVAILABLE : NOT_IN_LIBRARIES }
  const { item, server } = member
  const [episodes, open] = await Promise.all([
    item.type === "show" ? getPlexShowEpisodes(server, item.ratingKey) : null,
    prisma.problemReport.findUnique({
      where: { activeKey: titleKeyOf(item) },
      select: { id: true, reporterId: true, problem: true, status: true, updatedAt: true, events: { where: { kind: "ALSO_REPORTED", actorUserId: userId }, select: { id: true }, take: 1 } },
    }),
  ])
  return {
    ratingKey: item.ratingKey,
    type: item.type as ReportableType,
    title: reportTitle(item),
    episodes: episodes?.ok
      ? episodes.episodes.map((episode) => ({ ratingKey: episode.ratingKey, label: `S${episode.seasonNumber}E${episode.episodeNumber}: ${episode.title}` }))
      : null,
    openReport: open
      ? { id: open.id, problem: problemLabel(open.problem), status: open.status, since: open.updatedAt.toISOString(), yours: open.reporterId === userId || open.events.length > 0 }
      : null,
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
  const [reports, search, selected] = await Promise.all([
    listReports(userId),
    query ? searchTitles(userId, query) : null,
    params.item ? selectTitle(userId, params.item) : null,
  ])
  return { reports, search, selected }
}
