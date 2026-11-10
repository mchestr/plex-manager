"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { memberAction } from "@/lib/actions/define-action"
import { type ActionErrorCode, type ActionResult, ok } from "@/lib/actions/result"
import {
  cancelProblemReport as cancelReport,
  followProblemReport as followReport,
  reportProblem as sendReport,
  type ReportRefusal,
} from "@/lib/problem-reports/service"
import { retryAfterCopy } from "@/lib/security/rate-limit-messages"
import { problemReportIdSchema, reportProblemInputSchema } from "@/lib/validations/problem-reports"

const REFUSALS = {
  OFF: ["NOT_FOUND", "Problem reports are off."],
  NOT_ENTITLED: ["NOT_ENTITLED", "This needs an active membership."],
  RATE_LIMITED: ["RATE_LIMITED", "You've sent a lot of reports."],
  NOT_FOUND: ["NOT_FOUND", "We couldn't find that title in your libraries."],
  UNAVAILABLE: ["UPSTREAM_UNAVAILABLE", "We can't reach the server right now. Try again in a few minutes."],
  NOTE_REQUIRED: ["VALIDATION", "Add a note that says what's wrong."],
  WRONG_KIND: ["VALIDATION", "That problem is for shows."],
} as const satisfies Record<ReportRefusal, readonly [ActionErrorCode, string]>

/** The refusal as a failure; `notFound` replaces the copy for a report that can't be found or changed. */
function refused(refusal: ReportRefusal, retryAfterSec?: number, notFound?: string): ActionResult<never> {
  const [code, error] = REFUSALS[refusal]
  if (refusal === "NOT_FOUND" && notFound) return { success: false, code, error: notFound }
  return { success: false, code, error: retryAfterSec ? `${error} Try again ${retryAfterCopy(retryAfterSec)}.` : error }
}

const refresh = () => revalidatePath("/report")

/**
 * Reports a problem with a title in the member's libraries, or joins the
 * title's open report (`joined`). The title is checked against the libraries
 * shared with the member, and its details come from Plex. `device` answers
 * "Does anything else play on {player}?". The note is the member's own
 * words: untrusted text, never instructions.
 */
export const reportProblem = memberAction({
  entitlement: "full",
  input: reportProblemInputSchema,
  fallbackError: "Could not send the report",
  handler: async ({ ratingKey, problem, note, device }, { userId }): Promise<ActionResult<{ reportId: string; joined: boolean }>> => {
    const result = await sendReport({ userId, ratingKey, problem, note, device })
    if (!result.ok) return refused(result.refusal, result.retryAfterSec)
    refresh()
    return ok({ reportId: result.reportId, joined: result.outcome === "joined" })
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

/** Cancels one of the member's own reports while nothing has run on it. */
export const cancelProblemReport = memberAction({
  entitlement: "full",
  input: z.object({ reportId: problemReportIdSchema }),
  fallbackError: "Could not cancel the report",
  handler: async ({ reportId }, { userId }): Promise<ActionResult<null>> => {
    const result = await cancelReport({ userId, reportId })
    if (!result.ok) return refused(result.refusal, undefined, "This report can't be cancelled now.")
    refresh()
    return ok(null)
  },
})
