/**
 * "Ask the server admin": a member's Look for a better copy that found
 * nothing closes their report (`lib/problem-reports/run.ts`), and they can
 * put it back with the server admin once, from Your reports. It reopens
 * (`REOPENED`), with the title checked against their libraries again, and
 * the admins are alerted. When another report of the title opened in the
 * meantime, their problem joins that one instead (`joinOpenReport`).
 *
 * @module lib/problem-reports/ask-admin
 */

import "server-only"

import { prisma } from "@/lib/prisma"
import { isUniqueConflict } from "@/lib/prisma-errors"
import { readMemberItem } from "@/lib/problem-reports/access"
import { admit, refuse, type Refused } from "@/lib/problem-reports/admit"
import { queueReportAlert } from "@/lib/problem-reports/alerts"
import { joinOpenReport } from "@/lib/problem-reports/join"
import { isProblemCode } from "@/lib/problem-reports/taxonomy"
import { closedEventDataSchema } from "@/lib/validations/problem-reports"

/** "Ask the server admin" about the member's report that found no better copy: back with the admins, once. */
export async function askServerAdmin({ userId, reportId }: { userId: string; reportId: string }): Promise<{ ok: true; reportId: string } | Refused> {
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
  const member = await readMemberItem(userId, report.plexRatingKey)
  if (!member.ok) return refuse(member.reason)

  try {
    const reopened = await prisma.$transaction(async (tx) => {
      const { count } = await tx.problemReport.updateMany({
        where: { id: reportId, reporterId: userId, status: "CLOSED", activeKey: null },
        data: { status: "WITH_ADMIN", activeKey: report.titleKey, resolvedAt: null, alertedAt: null },
      })
      if (count === 0) return false
      await tx.problemReportEvent.create({ data: { reportId, kind: "REOPENED", actorUserId: userId } })
      return true
    })
    if (!reopened) return refuse("NOT_FOUND")
    await queueReportAlert(reportId)
    return { ok: true, reportId }
  } catch (error) {
    if (!isUniqueConflict(error, { index: "ProblemReport_activeKey_key", field: "activeKey" })) throw error
  }
  // Another report of the title opened since: the member's problem goes on that one
  const joined = await joinOpenReport({ activeKey: report.titleKey }, userId, { problem: isProblemCode(report.problem) ? report.problem : undefined, note: report.note })
  return joined ? { ok: true, reportId: joined } : refuse("UNAVAILABLE")
}
