/**
 * Reporting a problem with a title: the one entry point for the web and
 * Discord.
 *
 * ## Report
 *
 * 1. The switch must be on and the member entitled (`full`).
 * 2. Each report or follow spends `problem-report:create` (10 an hour) and
 *    `problem-report:create:day` (20 a day) for the member.
 * 3. The title must be in a library shared with the member (SEC-21,
 *    `readMemberItem`). Its type and display fields come from Plex, never
 *    from input.
 * 4. One open report per title: `activeKey` holds the title's Plex guid
 *    until the report closes, under a unique index. A second report of the
 *    title fails that index and joins the open one with an `ALSO_REPORTED`
 *    event, written after the failed transaction, not inside it. A report
 *    that closes in between is tried once more as a new one.
 *
 * A member's `ALSO_REPORTED` event is written once: the same problem and
 * note again, or a second follow, writes nothing. The join reads and writes
 * in one serializable transaction, so a double tap writes one event.
 * Following checks the title against the member's libraries too.
 *
 * Each report records what the member answered to "Does anything else play
 * on {player}?" and the evidence from Tautulli (`readEvidence`: their last
 * play, and whether the title has played to the end since its file was
 * added) on its `REPORTED` event, or on its `ALSO_REPORTED` event when it
 * joins an open report. A second member's problem and note go on that event
 * for the server admin; they never change the open report. Followers see status
 * words only, never who else reported.
 *
 * ## Cancel
 *
 * Only the reporter, and only while nothing has run on the report (status
 * `SENT` or `WITH_ADMIN`). Every way of closing a report clears `activeKey`,
 * and closes it for the members who followed it too. Cancel checks neither
 * the switch nor entitlement, on purpose: turning the feature off, or a
 * lapsed membership, never leaves a member unable to withdraw their own
 * report.
 *
 * @module
 */

import "server-only"

import { hasEntitlement } from "@/lib/actions/entitlement"
import type { PlexItemMetadata } from "@/lib/connections/plex"
import { inSerializable } from "@/lib/db/serializable"
import { prisma } from "@/lib/prisma"
import { isUniqueConflict } from "@/lib/prisma-errors"
import { readMemberItem } from "@/lib/problem-reports/access"
import { readEvidence, type Evidence } from "@/lib/problem-reports/evidence"
import { getProblemReportSettings } from "@/lib/problem-reports/settings"
import { needsNote, PROBLEMS, REPORTABLE_MEDIA_TYPES, type ProblemCode, type ReportableType } from "@/lib/problem-reports/taxonomy"
import { titleKeyOf } from "@/lib/problem-reports/title"
import { consume } from "@/lib/security/rate-limit"
import { alsoReportedDataSchema, type DeviceAnswer } from "@/lib/validations/problem-reports"

/** Why a report, follow or cancel was refused. */
export type ReportRefusal =
  | "OFF"
  | "NOT_ENTITLED"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "UNAVAILABLE"
  | "NOTE_REQUIRED"
  | "WRONG_KIND"

type Refused = { ok: false; refusal: ReportRefusal; retryAfterSec?: number }

const LIMITS = ["problem-report:create", "problem-report:create:day"] as const
const CANCELLABLE = ["SENT", "WITH_ADMIN"] as const

const refuse = (refusal: ReportRefusal): Refused => ({ ok: false, refusal })

/** The switch, entitlement and both rate limits, in that order. */
async function admit(userId: string): Promise<Refused | null> {
  if (!(await getProblemReportSettings()).enabled) return refuse("OFF")
  if (!(await hasEntitlement(userId, "full"))) return refuse("NOT_ENTITLED")
  for (const name of LIMITS) {
    const spent = await consume(name, userId)
    if (!spent.ok) return { ok: false, refusal: "RATE_LIMITED", retryAfterSec: spent.retryAfterSec }
  }
  return null
}

/** The report's title fields, from Plex. */
function titleFields(item: PlexItemMetadata) {
  return {
    mediaType: REPORTABLE_MEDIA_TYPES[item.type as ReportableType],
    plexRatingKey: item.ratingKey,
    titleKey: titleKeyOf(item),
    title: item.title,
    year: item.year ?? null,
    showTitle: item.showTitle ?? null,
    seasonNumber: item.seasonNumber ?? null,
    episodeNumber: item.episodeNumber ?? null,
  }
}

/** What a member adds to an open report: a problem, note, device answer and evidence, or nothing when they only follow it. */
type AlsoReported = { problem?: ProblemCode; note?: string | null; device?: DeviceAnswer; evidence?: Evidence }

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
async function joinOpenReport(where: { activeKey: string } | { id: string }, userId: string, said: AlsoReported): Promise<string | null> {
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

/**
 * Reports a problem with a title, or joins the title's open report.
 *
 * @returns `reported` with the new report, `joined` with the open one, or the refusal
 */
export async function reportProblem(input: {
  userId: string
  ratingKey: string
  problem: ProblemCode
  note: string | null
  device?: DeviceAnswer
}): Promise<{ ok: true; outcome: "reported" | "joined"; reportId: string } | Refused> {
  const { userId, problem, note, device } = input
  // Before the rate limits, so a missing note doesn't spend them
  if (needsNote(problem) && !note) return refuse("NOTE_REQUIRED")
  const refused = await admit(userId)
  if (refused) return refused

  const member = await readMemberItem(userId, input.ratingKey)
  if (!member.ok) return refuse(member.reason)
  if (PROBLEMS[problem].kind === "episodes" && member.item.type === "movie") return refuse("WRONG_KIND")

  const { titleKey, ...title } = titleFields(member.item)
  const evidence = await readEvidence(userId, member.item)
  const answers = device ? { device, evidence } : { evidence }
  for (let attempt = 1; ; attempt++) {
    try {
      const report = await prisma.$transaction(async (tx) => {
        const created = await tx.problemReport.create({
          data: { reporterId: userId, problem, note, ...title, titleKey, activeKey: titleKey, status: "WITH_ADMIN" },
          select: { id: true },
        })
        await tx.problemReportEvent.create({
          data: { reportId: created.id, kind: "REPORTED", actorUserId: userId, data: { problem, ...answers } },
        })
        return created
      })
      return { ok: true, outcome: "reported", reportId: report.id }
    } catch (error) {
      if (!isUniqueConflict(error, { index: "ProblemReport_activeKey_key", field: "activeKey" })) throw error
    }

    const joined = await joinOpenReport({ activeKey: titleKey }, userId, { problem, note, ...answers })
    if (joined) return { ok: true, outcome: "joined", reportId: joined }
    // The open report closed between the failed insert and the join: try once more as a new report
    if (attempt === 2) return refuse("UNAVAILABLE")
  }
}

/** "Same problem, tell me when it's fixed": follows an open report on a title in the member's libraries, once. */
export async function followProblemReport({ userId, reportId }: { userId: string; reportId: string }): Promise<{ ok: true } | Refused> {
  const refused = await admit(userId)
  if (refused) return refused

  const report = await prisma.problemReport.findFirst({ where: { id: reportId, activeKey: { not: null } }, select: { plexRatingKey: true } })
  if (!report) return refuse("NOT_FOUND")
  const member = await readMemberItem(userId, report.plexRatingKey)
  if (!member.ok) return refuse(member.reason)

  return (await joinOpenReport({ id: reportId }, userId, {})) ? { ok: true } : refuse("NOT_FOUND")
}

/** Cancels the member's own report while nothing has run on it. */
export async function cancelProblemReport({ userId, reportId }: { userId: string; reportId: string }): Promise<{ ok: true } | Refused> {
  const cancelled = await prisma.$transaction(async (tx) => {
    const { count } = await tx.problemReport.updateMany({
      where: { id: reportId, reporterId: userId, status: { in: [...CANCELLABLE] } },
      data: { status: "CLOSED", activeKey: null, resolvedAt: new Date() },
    })
    if (count === 0) return false
    await tx.problemReportEvent.create({ data: { reportId, kind: "CLOSED", actorUserId: userId, data: { reason: "cancelled" } } })
    return true
  })
  return cancelled ? { ok: true } : refuse("NOT_FOUND")
}
