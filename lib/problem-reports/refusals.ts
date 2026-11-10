/**
 * What a member reads when a report, follow or cancel is refused, on the web
 * (`actions/problem-reports.ts`) and in Discord (`/report`), with the error
 * code the web action answers with.
 *
 * @module lib/problem-reports/refusals
 */

import { NOT_ENTITLED_MESSAGE } from "@/lib/actions/entitlement"
import type { ActionErrorCode } from "@/lib/actions/result"
import type { ReportRefusal } from "@/lib/problem-reports/service"
import { retryAfterCopy } from "@/lib/security/rate-limit-messages"

export const REFUSALS = {
  OFF: ["NOT_FOUND", "Problem reports are off."],
  NOT_ENTITLED: ["NOT_ENTITLED", NOT_ENTITLED_MESSAGE],
  RATE_LIMITED: ["RATE_LIMITED", "You've sent a lot of reports."],
  NOT_FOUND: ["NOT_FOUND", "We couldn't find that title in your libraries."],
  UNAVAILABLE: ["UPSTREAM_UNAVAILABLE", "We can't reach the server right now. Try again in a few minutes."],
  NOTE_REQUIRED: ["VALIDATION", "Add a note that says what's wrong."],
  WRONG_KIND: ["VALIDATION", "That problem is for shows."],
} as const satisfies Record<ReportRefusal, readonly [ActionErrorCode, string]>

/** The words for a refusal; a rate limit also says when to try again. */
export function refusalCopy(refusal: ReportRefusal, retryAfterSec?: number): string {
  const words = REFUSALS[refusal][1]
  return retryAfterSec ? `${words} Try again ${retryAfterCopy(retryAfterSec)}.` : words
}
