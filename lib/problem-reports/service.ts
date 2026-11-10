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
 *    event, written after the failed transaction, not inside it.
 *
 * A second member's problem and note go on their `ALSO_REPORTED` event for
 * the server admin; they never change the open report. Followers see status
 * words only, never who else reported.
 *
 * ## Cancel
 *
 * Only the reporter, and only while nothing has run on the report (status
 * `SENT` or `WITH_ADMIN`). Every way of closing a report clears `activeKey`.
 *
 * @module
 */

import "server-only"

import { hasEntitlement } from "@/lib/actions/entitlement"
import type { PlexItemMetadata } from "@/lib/connections/plex"
import type { MediaType } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { isUniqueConflict } from "@/lib/prisma-errors"
import { readMemberItem } from "@/lib/problem-reports/access"
import { getProblemReportSettings } from "@/lib/problem-reports/settings"
import { needsNote, PROBLEMS, type ProblemCode } from "@/lib/problem-reports/taxonomy"
import { titleKeyOf } from "@/lib/problem-reports/title"
import { consume } from "@/lib/security/rate-limit"

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
const MEDIA_TYPES: Record<string, MediaType> = { movie: "MOVIE", show: "TV_SERIES", episode: "EPISODE" }

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
    mediaType: MEDIA_TYPES[item.type],
    plexRatingKey: item.ratingKey,
    titleKey: titleKeyOf(item),
    title: item.title,
    year: item.year ?? null,
    showTitle: item.showTitle ?? null,
    seasonNumber: item.seasonNumber ?? null,
    episodeNumber: item.episodeNumber ?? null,
  }
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
}): Promise<{ ok: true; outcome: "reported" | "joined"; reportId: string } | Refused> {
  const { userId, problem, note } = input
  const refused = await admit(userId)
  if (refused) return refused
  if (needsNote(problem) && !note) return refuse("NOTE_REQUIRED")

  const member = await readMemberItem(userId, input.ratingKey)
  if (!member.ok) return refuse(member.reason)
  if (PROBLEMS[problem].kind === "episodes" && member.item.type === "movie") return refuse("WRONG_KIND")

  const { titleKey, ...title } = titleFields(member.item)
  try {
    const report = await prisma.$transaction(async (tx) => {
      const created = await tx.problemReport.create({
        data: { reporterId: userId, problem, note, ...title, titleKey, activeKey: titleKey, status: "WITH_ADMIN" },
        select: { id: true },
      })
      await tx.problemReportEvent.create({ data: { reportId: created.id, kind: "REPORTED", actorUserId: userId, data: { problem } } })
      return created
    })
    return { ok: true, outcome: "reported", reportId: report.id }
  } catch (error) {
    if (!isUniqueConflict(error, { index: "ProblemReport_activeKey_key", field: "activeKey" })) throw error
  }

  const open = await prisma.problemReport.findUnique({ where: { activeKey: titleKey }, select: { id: true } })
  // It closed between the failed insert and this read; the member can send it again
  if (!open) return refuse("UNAVAILABLE")
  await prisma.problemReportEvent.create({
    data: { reportId: open.id, kind: "ALSO_REPORTED", actorUserId: userId, data: { problem, note } },
  })
  return { ok: true, outcome: "joined", reportId: open.id }
}

/** "Same problem, tell me when it's fixed": follows an open report, once. */
export async function followProblemReport({ userId, reportId }: { userId: string; reportId: string }): Promise<{ ok: true } | Refused> {
  const refused = await admit(userId)
  if (refused) return refused

  const report = await prisma.problemReport.findFirst({
    where: { id: reportId, activeKey: { not: null } },
    select: { id: true, reporterId: true, events: { where: { kind: "ALSO_REPORTED", actorUserId: userId }, select: { id: true }, take: 1 } },
  })
  if (!report) return refuse("NOT_FOUND")
  if (report.reporterId === userId || report.events.length > 0) return { ok: true }

  await prisma.problemReportEvent.create({ data: { reportId: report.id, kind: "ALSO_REPORTED", actorUserId: userId, data: {} } })
  return { ok: true }
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
