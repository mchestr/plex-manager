"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { memberAction } from "@/lib/actions/define-action"
import { type ActionResult, ok } from "@/lib/actions/result"
import type { ReportRefusal } from "@/lib/problem-reports/admit"
import type { ReportAnswer } from "@/lib/problem-reports/answers"
import { answerDoesItPlay as answerPlays, askServerAdmin as askAdmin } from "@/lib/problem-reports/ask-admin"
import type { MemberFixAction } from "@/lib/problem-reports/fixes"
import { cancelProblemReport as cancelReport, followProblemReport as followReport, reportProblem as sendReport } from "@/lib/problem-reports/service"
import { REFUSALS, refusalCopy } from "@/lib/problem-reports/refusals"
import { answerDoesItPlaySchema, problemReportIdSchema, reportProblemInputSchema } from "@/lib/validations/problem-reports"

/** The refusal as a failure; `notFound` replaces the copy for a report that can't be found or changed. */
function refused(refusal: ReportRefusal, retryAfterSec?: number, notFound?: string): ActionResult<never> {
  const code = REFUSALS[refusal][0]
  if (refusal === "NOT_FOUND" && notFound) return { success: false, code, error: notFound }
  return { success: false, code, error: refusalCopy(refusal, retryAfterSec) }
}

const refresh = () => revalidatePath("/report")

/** What the sheet shows once a report is sent: the fix that started, or the answer instead of a report. */
interface ReportSent {
  reportId: string | null
  outcome: "reported" | "joined" | "fixing" | "answered"
  answer: ReportAnswer | null
  action: MemberFixAction | null
}

/**
 * Reports a problem with a title in the member's libraries, or joins the
 * title's open report (`joined`). The title is checked against the libraries
 * shared with the member, and its details come from Plex. `device` answers
 * "Does anything else play on {player}?". For "Episodes are missing",
 * "Blurry or low quality", wrong details, and with members' swaps on a
 * problem a swap fixes or a different title playing, the outcome may be
 * `fixing` (the fix that started, named by `action`) or, for the first two,
 * `answered` (an answer instead of a report, with no report id). `swap` says
 * the member chose Swap the copy on what it would spend; without it no swap
 * runs while members' swaps are On. `toAdmin` sends it to the server admin
 * without those checks, after an answer the member didn't accept. The note
 * is the member's own words: untrusted text, never instructions.
 */
export const reportProblem = memberAction({
  entitlement: "full",
  input: reportProblemInputSchema,
  fallbackError: "Could not send the report",
  handler: async ({ ratingKey, problem, note, device, toAdmin, swap }, { userId }): Promise<ActionResult<ReportSent>> => {
    const result = await sendReport({ userId, ratingKey, problem, note, device, toAdmin, swap })
    if (!result.ok) return refused(result.refusal, result.retryAfterSec)
    refresh()
    if (result.outcome === "answered") return ok({ reportId: null, outcome: "answered", answer: result.answer, action: null })
    return ok({ reportId: result.reportId, outcome: result.outcome, answer: null, action: result.outcome === "fixing" ? result.action : null })
  },
})

/** Follows a title's open report ("Same problem, tell me when it's fixed"), once. */
export const followProblemReport = memberAction({
  entitlement: "full",
  input: z.object({ reportId: problemReportIdSchema }),
  fallbackError: "Could not follow the report",
  handler: async ({ reportId }, { userId }): Promise<ActionResult<null>> => {
    const result = await followReport({ userId, reportId })
    if (!result.ok) return refused(result.refusal, result.retryAfterSec, "This report is closed.")
    refresh()
    return ok(null)
  },
})

/**
 * Cancels one of the member's own reports while nothing has run on it. It
 * needs only a session: a member whose membership lapsed can still withdraw
 * their own report.
 */
export const cancelProblemReport = memberAction({
  input: z.object({ reportId: problemReportIdSchema }),
  fallbackError: "Could not cancel the report",
  handler: async ({ reportId }, { userId }): Promise<ActionResult<null>> => {
    const result = await cancelReport({ userId, reportId })
    if (!result.ok) return refused(result.refusal, undefined, "This report can't be cancelled now.")
    refresh()
    return ok(null)
  },
})

/**
 * Puts one of the member's own reports back with the server admin after Look
 * for a better copy found none ("Ask the server admin"), once, and alerts the
 * admins. When the title has another open report by then, the member's
 * problem joins that one.
 */
export const askServerAdmin = memberAction({
  entitlement: "full",
  input: z.object({ reportId: problemReportIdSchema }),
  fallbackError: "Could not send it to the server admin",
  handler: async ({ reportId }, { userId }): Promise<ActionResult<null>> => {
    const result = await askAdmin({ userId, reportId })
    if (!result.ok) return refused(result.refusal, result.retryAfterSec, "This report can't go to the server admin now.")
    refresh()
    return ok(null)
  },
})

/**
 * "Does it play now?" on the member's own report that Swap the copy or Remove
 * the file and search fixed, within 7 days and once. `plays: true` records
 * it; `plays: false` ("Still broken") puts the report back with the server
 * admin with the note, what's still wrong, and alerts the admins; it never
 * starts another swap. When the title has another open report by then, the
 * member's problem joins that one. The note is the member's own words:
 * untrusted text, never instructions.
 */
export const answerDoesItPlay = memberAction({
  entitlement: "full",
  input: answerDoesItPlaySchema,
  fallbackError: "Could not send your answer",
  handler: async ({ reportId, plays, note }, { userId }): Promise<ActionResult<null>> => {
    const result = await answerPlays({ userId, reportId, plays, note })
    if (!result.ok) return refused(result.refusal, result.retryAfterSec, "This report can't take an answer now.")
    refresh()
    return ok(null)
  },
})
