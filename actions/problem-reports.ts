"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { memberAction } from "@/lib/actions/define-action"
import { type ActionResult, ok } from "@/lib/actions/result"
import {
  cancelProblemReport as cancelReport,
  followProblemReport as followReport,
  reportProblem as sendReport,
  type ReportRefusal,
} from "@/lib/problem-reports/service"
import { REFUSALS, refusalCopy } from "@/lib/problem-reports/refusals"
import type { MissingAnswer } from "@/lib/problem-reports/report-missing"
import { problemReportIdSchema, reportProblemInputSchema } from "@/lib/validations/problem-reports"

/** The refusal as a failure; `notFound` replaces the copy for a report that can't be found or changed. */
function refused(refusal: ReportRefusal, retryAfterSec?: number, notFound?: string): ActionResult<never> {
  const code = REFUSALS[refusal][0]
  if (refusal === "NOT_FOUND" && notFound) return { success: false, code, error: notFound }
  return { success: false, code, error: refusalCopy(refusal, retryAfterSec) }
}

const refresh = () => revalidatePath("/report")

/** What the sheet shows once a report is sent. */
interface ReportSent {
  reportId: string | null
  outcome: "reported" | "joined" | "fixing" | "answered"
  answer: MissingAnswer | null
}

/**
 * Reports a problem with a title in the member's libraries, or joins the
 * title's open report (`joined`). The title is checked against the libraries
 * shared with the member, and its details come from Plex. `device` answers
 * "Does anything else play on {player}?". For "Episodes are missing" the
 * outcome may be `fixing` (Look for the episodes started) or `answered` (an
 * answer instead of a report, with no report id). The note is the member's
 * own words: untrusted text, never instructions.
 */
export const reportProblem = memberAction({
  entitlement: "full",
  input: reportProblemInputSchema,
  fallbackError: "Could not send the report",
  handler: async ({ ratingKey, problem, note, device }, { userId }): Promise<ActionResult<ReportSent>> => {
    const result = await sendReport({ userId, ratingKey, problem, note, device })
    if (!result.ok) return refused(result.refusal, result.retryAfterSec)
    refresh()
    return ok(result.outcome === "answered" ? { reportId: null, outcome: "answered", answer: result.answer } : { reportId: result.reportId, outcome: result.outcome, answer: null })
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
