/**
 * Your reports on `/report`: the member's reports and the ones they follow,
 * newest first, with the status, the latest step in their words
 * (`./report-latest`) and what they can do next. The list and the page's
 * switched-off view both read it.
 *
 * @module lib/member/your-reports
 */

import "server-only"

import type { ProblemReportStatus } from "@/lib/generated/prisma/client"
import { memberStatuses } from "@/lib/member/dry-runs"
import { latestWords } from "@/lib/member/report-latest"
import { prisma } from "@/lib/prisma"
import { ASKS_PLAYS, FIX_ACTIONS, FIX_WORDS, PLAYS_WINDOW_MS } from "@/lib/problem-reports/fixes"
import { problemLabel } from "@/lib/problem-reports/taxonomy"
import { reportTitle } from "@/lib/problem-reports/title"
import { closedEventDataSchema } from "@/lib/validations/problem-reports"

const REPORT_LIMIT = 50
const CANCELLABLE: ReadonlySet<ProblemReportStatus> = new Set(["SENT", "WITH_ADMIN"])

/** One of the member's reports, or one they follow. */
export interface ReportRow {
  id: string
  title: string
  problem: string
  status: ProblemReportStatus
  /** The latest event in words, and when: "You sent it", "You cancelled it", "The server admin fixed it". */
  latest: { words: string; at: string }
  canCancel: boolean
  /** "Ask the server admin": the member's own report, closed because Look for a better copy found none. */
  canAsk: boolean
  /** "Does it play now?": the member's own report that a swap or a removal fixed in the last 7 days, not yet answered. */
  askPlays: boolean
  /** The status badge's second line: why a closed report closed. */
  statusSub: string | null
  /** The server admin's note, for the member who reported it once it is fixed or closed; plain text. */
  note: string | null
}

/** The member's reports and the ones they follow, newest first: what the list on `/report` and its switched-off view show. */
export async function listMemberReports(userId: string): Promise<ReportRow[]> {
  const rows = await prisma.problemReport.findMany({
    where: { OR: [{ reporterId: userId }, { events: { some: { kind: "ALSO_REPORTED", actorUserId: userId } } }] },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: REPORT_LIMIT,
    select: {
      id: true, reporterId: true, problem: true, status: true, title: true, year: true, showTitle: true, seasonNumber: true,
      episodeNumber: true, createdAt: true, memberNote: true, action: true,
      events: {
        where: { OR: [{ kind: { in: ["CLOSED", "FIXED", "REOPENED", "PLAYS"] } }, { kind: "ALSO_REPORTED", actorUserId: userId }] },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { kind: true, data: true, createdAt: true },
      },
    },
  })
  const now = Date.now()
  const statuses = await memberStatuses(rows)
  return rows.map((row) => {
    const own = row.reporterId === userId
    const event = row.events[0]
    const status = statuses.get(row.id) ?? row.status
    const swapped = row.status === "FIXED" && event?.kind === "FIXED" && ASKS_PLAYS.some((action) => action === row.action)
    const { words, statusSub } = latestWords(event, own)
    const fixing = status === "FIXING" ? FIX_ACTIONS.find((action) => action === row.action) : undefined
    return {
      id: row.id,
      title: reportTitle(row),
      problem: problemLabel(row.problem),
      status,
      latest: { words, at: (event?.createdAt ?? row.createdAt).toISOString() },
      canCancel: own && CANCELLABLE.has(row.status),
      canAsk: own && row.status === "CLOSED" && event?.kind === "CLOSED" && closedEventDataSchema.safeParse(event.data).data?.reason === "no_better_copy",
      askPlays: own && swapped && now - event.createdAt.getTime() <= PLAYS_WINDOW_MS,
      statusSub: fixing ? FIX_WORDS[fixing].running : statusSub,
      // Written for the member who reported it; followers see the status only
      note: own ? row.memberNote : null,
    }
  })
}
