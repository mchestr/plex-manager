/**
 * A member's report going back to the server admin after a fix ended it
 * (docs/problem-reports.md, "Your reports"):
 *
 * - **Ask the server admin**: a member's Look for a better copy that found
 *   nothing closes their report (`lib/problem-reports/run.ts`), and they can
 *   put it back with the server admin once, from Your reports.
 * - **Does it play now?**: after Swap the copy or Remove the file and search
 *   brought in another copy, the member who reported it says, within 7 days
 *   and once, whether it plays. "It plays" is recorded (`PLAYS`); "Still
 *   broken" puts the report back with the server admin with what's still
 *   wrong, and never starts another swap.
 *
 * Either way the report reopens (`REOPENED`), with the title checked against
 * their libraries again, and the admins are alerted. When another report of
 * the title opened in the meantime, their problem joins that one instead
 * (`joinOpenReport`).
 *
 * @module lib/problem-reports/ask-admin
 */

import "server-only"

import type { ProblemReportStatus } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { isUniqueConflict } from "@/lib/prisma-errors"
import { readMemberItem } from "@/lib/problem-reports/access"
import { admit, refuse, type Refused } from "@/lib/problem-reports/admit"
import { queueReportAlert } from "@/lib/problem-reports/alerts"
import { ASKS_PLAYS, PLAYS_WINDOW_MS } from "@/lib/problem-reports/fixes"
import { joinOpenReport } from "@/lib/problem-reports/join"
import { isProblemCode } from "@/lib/problem-reports/taxonomy"
import { closedEventDataSchema } from "@/lib/validations/problem-reports"

type Answered = { ok: true; reportId: string } | Refused

/** The report back with the admins from `from`, or the member's problem on the title's newer open report. */
async function reopen(
  report: { id: string; titleKey: string; problem: string; note: string | null; plexRatingKey: string },
  userId: string,
  from: ProblemReportStatus,
  data?: { reason: "still_broken"; note: string | null }
): Promise<Answered> {
  const member = await readMemberItem(userId, report.plexRatingKey)
  if (!member.ok) return refuse(member.reason)
  try {
    const reopened = await prisma.$transaction(async (tx) => {
      const { count } = await tx.problemReport.updateMany({
        where: { id: report.id, reporterId: userId, status: from, activeKey: null },
        data: { status: "WITH_ADMIN", activeKey: report.titleKey, resolvedAt: null, alertedAt: null },
      })
      if (count === 0) return false
      await tx.problemReportEvent.create({ data: { reportId: report.id, kind: "REOPENED", actorUserId: userId, ...(data ? { data } : {}) } })
      return true
    })
    if (!reopened) return refuse("NOT_FOUND")
    await queueReportAlert(report.id)
    return { ok: true, reportId: report.id }
  } catch (error) {
    if (!isUniqueConflict(error, { index: "ProblemReport_activeKey_key", field: "activeKey" })) throw error
  }
  // Another report of the title opened since: the member's problem goes on that one
  const problem = isProblemCode(report.problem) ? report.problem : undefined
  const joined = await joinOpenReport({ activeKey: report.titleKey }, userId, { problem, note: data ? data.note : report.note })
  return joined ? { ok: true, reportId: joined } : refuse("UNAVAILABLE")
}

/** "Ask the server admin" about the member's report that found no better copy: back with the admins, once. */
export async function askServerAdmin({ userId, reportId }: { userId: string; reportId: string }): Promise<Answered> {
  const refused = await admit(userId)
  if (refused) return refused

  const report = await prisma.problemReport.findFirst({
    where: { id: reportId, reporterId: userId, status: "CLOSED" },
    select: {
      titleKey: true, problem: true, note: true, plexRatingKey: true,
      events: { where: { kind: { in: ["CLOSED", "REOPENED"] } }, orderBy: { createdAt: "desc" }, take: 1, select: { kind: true, data: true } },
    },
  })
  const last = report?.events[0]
  if (!report || last?.kind !== "CLOSED" || closedEventDataSchema.safeParse(last.data).data?.reason !== "no_better_copy") return refuse("NOT_FOUND")
  return reopen({ id: reportId, ...report }, userId, "CLOSED")
}

/** "Does it play now?" about the member's report that a swap or a removal fixed: within 7 days, once. */
export async function answerDoesItPlay(
  { userId, reportId, plays, note }: { userId: string; reportId: string; plays: boolean; note: string | null },
  now = new Date()
): Promise<Answered> {
  const report = await prisma.problemReport.findFirst({
    where: { id: reportId, reporterId: userId, status: "FIXED", action: { in: [...ASKS_PLAYS] } },
    select: {
      titleKey: true, problem: true, plexRatingKey: true,
      events: { where: { kind: { in: ["FIXED", "PLAYS", "REOPENED"] } }, orderBy: { createdAt: "desc" }, take: 1, select: { kind: true, createdAt: true } },
    },
  })
  const last = report?.events[0]
  if (!report || last?.kind !== "FIXED" || now.getTime() - last.createdAt.getTime() > PLAYS_WINDOW_MS) return refuse("NOT_FOUND")
  if (plays) {
    await prisma.problemReportEvent.create({ data: { reportId, kind: "PLAYS", actorUserId: userId } })
    return { ok: true, reportId }
  }
  // Still broken is the server admin's to look at: it never starts another swap
  const refused = await admit(userId)
  if (refused) return refused
  return reopen({ id: reportId, ...report, note: null }, userId, "FIXED", { reason: "still_broken", note })
}
