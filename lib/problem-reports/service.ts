/**
 * Reporting a problem with a title: the one entry point for the web and
 * Discord.
 *
 * ## Report
 *
 * 1. The switch must be on and the member entitled (`full`).
 * 2. Each report or follow spends `problem-report:create` (10 an hour) and
 *    `problem-report:create:day` (20 a day) for the member (`admit`).
 * 3. The title must be in a library shared with the member (SEC-21,
 *    `readMemberItem`). Its type and display fields come from Plex, never
 *    from input.
 * 4. One open report per title: `activeKey` holds the title's Plex guid
 *    until the report closes, under a unique index. A second report of the
 *    title fails that index and joins the open one with an `ALSO_REPORTED`
 *    event, written after the failed transaction, not inside it. A report
 *    that closes in between is tried once more as a new one.
 *
 * A member's `ALSO_REPORTED` event is written once (`joinOpenReport`).
 * Following checks the title against the member's libraries too.
 *
 * Each report records what the member answered to "Does anything else play
 * on {player}?" and the evidence from Tautulli (`readEvidence`: their last
 * play, and whether the title has played to the end since its file was
 * added) on its `REPORTED` event, or on its `ALSO_REPORTED` event when it
 * joins an open report. The answer is kept only when the evidence names the
 * player of that last play, which is the player the question asked about.
 * A second member's problem and note go on that event
 * for the server admin; they never change the open report. Followers see status
 * words only, never who else reported. A new report also queues the admins'
 * Discord alert (`queueReportAlert`); a join adds to a report they know of.
 *
 * "Episodes are missing" is about a show, so an episode's report is filed on
 * its show, and Sonarr and Plex are read first (`decideMissingForMember`):
 * an episode that hasn't aired, or seasons that aren't monitored, get an
 * answer and no report; episodes to scan or search for start Look for the
 * episodes on the new report (`startFix`) instead of alerting the admins;
 * anything else goes to them with a `TO_ADMIN` event that says why.
 *
 * "Blurry or low quality" about a movie or an episode reads the evidence,
 * the file and its quality profile first (`decideBetterCopyForMember`): a
 * file the profile counts as good enough gets an answer and no report; one it
 * would upgrade starts Look for a better copy; anything else, a converted
 * play included, goes to the admins with why.
 *
 * `toAdmin` skips both checks, for a member who saw an answer and sends the
 * report anyway.
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

import type { PlexItemMetadata } from "@/lib/connections/plex"
import { prisma } from "@/lib/prisma"
import { isUniqueConflict } from "@/lib/prisma-errors"
import { readMemberItem, type MemberItem } from "@/lib/problem-reports/access"
import { admit, refuse, type Refused } from "@/lib/problem-reports/admit"
import { queueReportAlert } from "@/lib/problem-reports/alerts"
import type { ReportAnswer } from "@/lib/problem-reports/answers"
import { readEvidence } from "@/lib/problem-reports/evidence"
import type { MemberFixAction } from "@/lib/problem-reports/fixes"
import { joinOpenReport } from "@/lib/problem-reports/join"
import { decideBetterCopyForMember } from "@/lib/problem-reports/report-better-copy"
import { decideDetailsForMember } from "@/lib/problem-reports/report-details"
import { decideMatchForMember, decideSwapForMember } from "@/lib/problem-reports/member-swap"
import { decideMissingForMember } from "@/lib/problem-reports/report-missing"
import { startFix } from "@/lib/problem-reports/run"
import { queueMemberUpdates } from "@/lib/problem-reports/updates"
import { asksDevice, needsNote, PROBLEMS, REPORTABLE_MEDIA_TYPES, type ProblemCode, type ReportableType } from "@/lib/problem-reports/taxonomy"
import { titleKeyOf } from "@/lib/problem-reports/title"
import type { DeviceAnswer, ToAdminReason } from "@/lib/validations/problem-reports"

const CANCELLABLE = ["SENT", "WITH_ADMIN"] as const
/** Inserts tried: one, and one more when the open report it collided with closed before the join. */
const CREATE_ATTEMPTS = 2

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

/** What a report led to: a new report (with a fix running, or with the server admin), a join, or an answer instead. */
export type ReportOutcome =
  | { ok: true; outcome: "reported" | "joined"; reportId: string }
  | { ok: true; outcome: "fixing"; reportId: string; action: MemberFixAction }
  | { ok: true; outcome: "answered"; reportId: null; answer: ReportAnswer }

/** What the app's own checks decided before the report is saved: a fix to start (a swap may be a dry run), or why it goes to the admins. */
type Decided = { fix: MemberFixAction; dryRun: boolean } | { toAdmin: ToAdminReason } | null

/** The title a problem is about: for "Episodes are missing", an episode's show. */
async function reportedTitle(userId: string, problem: ProblemCode, member: Extract<MemberItem, { ok: true }>): Promise<MemberItem> {
  if (problem !== "missing_episodes" || member.item.type !== "episode") return member
  return member.item.grandparentRatingKey ? readMemberItem(userId, member.item.grandparentRatingKey) : { ok: false, reason: "NOT_FOUND" }
}

/**
 * Reports a problem with a title, or joins the title's open report.
 *
 * @returns `reported` with the new report, `fixing` when a fix started on it, `joined` with the open one, `answered` with no report, or the refusal
 */
export async function reportProblem(input: {
  userId: string
  ratingKey: string
  problem: ProblemCode
  note: string | null
  device?: DeviceAnswer
  toAdmin?: boolean
  /** The member chose Swap the copy, on what the sheet said it would spend. */
  swap?: boolean
}): Promise<ReportOutcome | Refused> {
  const { userId, problem, note, device, toAdmin = false } = input
  // Before the rate limits, so a missing note doesn't spend them
  if (needsNote(problem) && !note) return refuse("NOTE_REQUIRED")
  const refused = await admit(userId)
  if (refused) return refused

  const picked = await readMemberItem(userId, input.ratingKey)
  if (!picked.ok) return refuse(picked.reason)
  if (PROBLEMS[problem].kind === "episodes" && picked.item.type === "movie") return refuse("WRONG_KIND")
  const member = await reportedTitle(userId, problem, picked)
  if (!member.ok) return refuse(member.reason)

  const missing = problem === "missing_episodes" && !toAdmin ? await decideMissingForMember(member.server, member.item, new Date()) : null
  if (missing && "answer" in missing) return { ok: true, outcome: "answered", reportId: null, answer: missing.answer }

  const { titleKey, ...title } = titleFields(member.item)
  const evidence = await readEvidence(userId, member.item)
  const betterCopy = problem === "blurry" && !toAdmin && member.item.type !== "show" ? await decideBetterCopyForMember(member.server, member.item.ratingKey, evidence) : null
  if (betterCopy && "answer" in betterCopy) return { ok: true, outcome: "answered", reportId: null, answer: betterCopy.answer }
  const details = problem === "wrong_details" && !toAdmin ? await decideDetailsForMember(member.item.type) : null
  // The player question is asked only for some playback problems, about the player of the member's last play of
  // the title. An answer is kept only then, so it is about the player in this event's evidence, unless the member
  // started the title on another player between opening the sheet and sending it.
  const kept = device && asksDevice(problem) && evidence.lastPlay?.player ? device : undefined
  const answers = kept ? { device: kept, evidence } : { evidence }
  const swap =
    PROBLEMS[problem].fix === "SWAP" && !toAdmin
      ? await decideSwapForMember({ userId, item: member.item, server: member.server, problem, device: kept, evidence, chose: input.swap === true }, new Date())
      : null
  const match = problem === "different_title" && !toAdmin ? await decideMatchForMember(member.server, member.item) : null
  const checked = missing ?? betterCopy ?? details ?? swap ?? match
  const fix: MemberFixAction = missing ? "LOOK_FOR_MISSING" : betterCopy ? "BETTER_COPY" : details ? "REFRESH" : swap ? "SWAP" : "FIX_MATCH"
  const dryRun = swap?.startsFix === true && swap.dryRun
  const decided: Decided = !checked ? null : checked.startsFix ? { fix, dryRun } : { toAdmin: checked.reason }
  for (let attempt = 1; attempt <= CREATE_ATTEMPTS; attempt++) {
    try {
      const report = await prisma.$transaction(async (tx) => {
        const created = await tx.problemReport.create({
          data: { reporterId: userId, problem, note, ...title, titleKey, activeKey: titleKey, status: "WITH_ADMIN" },
          select: { id: true },
        })
        await tx.problemReportEvent.create({
          data: { reportId: created.id, kind: "REPORTED", actorUserId: userId, data: { problem, ...answers } },
        })
        if (decided && "toAdmin" in decided) await tx.problemReportEvent.create({ data: { reportId: created.id, kind: "TO_ADMIN", data: { reason: decided.toAdmin } } })
        return created
      })
      if (decided && "fix" in decided && (await startFix({ reportId: report.id, action: decided.fix, trigger: "automatic", actorUserId: userId, dryRun: decided.dryRun })).ok) {
        // A dry run is with the server admin as far as the member knows; its job alerts the admins when it hands the report over
        return decided.dryRun ? { ok: true, outcome: "reported", reportId: report.id } : { ok: true, outcome: "fixing", reportId: report.id, action: decided.fix }
      }
      await queueReportAlert(report.id)
      return { ok: true, outcome: "reported", reportId: report.id }
    } catch (error) {
      if (!isUniqueConflict(error, { index: "ProblemReport_activeKey_key", field: "activeKey" })) throw error
    }

    const joined = await joinOpenReport({ activeKey: titleKey }, userId, { problem, note, ...answers })
    if (joined) return { ok: true, outcome: "joined", reportId: joined }
    // The open report closed between the failed insert and the join, which frees the title: insert again
  }
  // The title's report closed between insert and join on every attempt: refuse rather than loop
  return refuse("UNAVAILABLE")
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
  if (!cancelled) return refuse("NOT_FOUND")
  // The members who followed it hear that it closed; the reporter cancelled it
  await queueMemberUpdates(reportId, "CLOSED", { except: userId, from: "request" })
  return { ok: true }
}
