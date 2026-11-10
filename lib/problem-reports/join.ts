/**
 * Joining a title's open report: a member's `ALSO_REPORTED` event, written
 * once. The same problem and note again, or a second follow, writes nothing.
 * The join reads and writes in one serializable transaction, so a double tap
 * writes one event.
 *
 * @module lib/problem-reports/join
 */

import "server-only"

import { inSerializable } from "@/lib/db/serializable"
import type { Evidence } from "@/lib/problem-reports/evidence"
import type { ProblemCode } from "@/lib/problem-reports/taxonomy"
import { alsoReportedDataSchema, type DeviceAnswer } from "@/lib/validations/problem-reports"

/** What a member adds to an open report: a problem, note, device answer and evidence, or nothing when they only follow it. */
export type AlsoReported = { problem?: ProblemCode; note?: string | null; device?: DeviceAnswer; evidence?: Evidence }

/** Whether the member already said this on the report: as its reporter, or in an `ALSO_REPORTED` event. */
function alreadySaid(
  report: { reporterId: string; problem: string; note: string | null; events: { data: unknown }[] },
  userId: string,
  said: AlsoReported
): boolean {
  if (said.problem === undefined) return report.reporterId === userId || report.events.length > 0
  const same = (problem: string | undefined, note: string | null | undefined) => problem === said.problem && (note ?? null) === (said.note ?? null)
  if (report.reporterId === userId && same(report.problem, report.note)) return true
  return report.events.some((event) => {
    const data = alsoReportedDataSchema.safeParse(event.data)
    return data.success && same(data.data.problem, data.data.note)
  })
}

/**
 * Adds an `ALSO_REPORTED` event to an open report, once, in one serializable
 * transaction. The report's id, or null when it isn't open.
 */
export async function joinOpenReport(where: { activeKey: string } | { id: string }, userId: string, said: AlsoReported): Promise<string | null> {
  return inSerializable(async (tx) => {
    const report = await tx.problemReport.findFirst({
      where: { ...where, activeKey: "activeKey" in where ? where.activeKey : { not: null } },
      select: { id: true, reporterId: true, problem: true, note: true, events: { where: { kind: "ALSO_REPORTED", actorUserId: userId }, select: { data: true } } },
    })
    if (!report) return null
    if (!alreadySaid(report, userId, said)) {
      await tx.problemReportEvent.create({ data: { reportId: report.id, kind: "ALSO_REPORTED", actorUserId: userId, data: said } })
    }
    return report.id
  })
}
