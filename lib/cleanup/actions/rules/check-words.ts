/**
 * The fail text of a turn-on check (UX 7.13, TS 10.3 `turnOnCleanupRule`
 * step 6): the words that `VALIDATION` returns when a check stops a turn-on
 * in the chosen mode. The page shows the same checks from
 * `computeTurnOnReview()`. Server-only (the app zone formats times).
 *
 * @module lib/cleanup/actions/rules/check-words
 */

import "server-only"

import { type BlockCauseWords, blockCause, blockSchema } from "@/lib/cleanup/blocks"
import { CLEANUP_ERRORS, TAUTULLI_STALE_DAYS } from "@/lib/cleanup/constants"
import { automaticGraceMessage } from "@/lib/cleanup/editor/errors"
import { NOUNS, SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import type { TurnOnCheck } from "@/lib/cleanup/types/rule-parts"
import type { BoundFormat } from "@/lib/utils/format"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

/** What a failed library data check adds after its cause (UX 7.13). */
const DATA_NEXT: Record<string, string> = {
  noData: " Refresh data, or wait for the nightly read.",
  sourceFailed: " Refresh data, or wait for the nightly read.",
  dataStale: " Refresh it first.",
}

const num = (value: string | number | undefined): number => Number(value ?? 0)

/** The cause of a failed `libraryData` check, from the block fields it holds. */
function dataText(check: TurnOnCheck, f: BoundFormat): string {
  const block = blockSchema.safeParse(check.values)
  const words: BlockCauseWords = { service: (service) => SERVICE_NAMES[service], rule: () => "the rule", time: (iso) => f.time(iso) }
  const cause = blockCause(block.success ? block.data : { code: "noData" }, words)
  return `${cause}${DATA_NEXT[String(check.values.code)] ?? ""}`
}

/**
 * The words of a check that stops the turn-on. A check that this file does
 * not know reads "The numbers changed. Check them again." (it never
 * happens: every check id that can stop a turn-on has its words).
 */
export function checkFailureText(check: TurnOnCheck, level: Level, f: BoundFormat): string {
  const { values } = check
  switch (check.id) {
    case "featureOn":
      return CLEANUP_ERRORS.CLEANUP_OFF
    case "notPaused":
      return CLEANUP_ERRORS.CLEANUP_PAUSED
    case "libraryData":
      return dataText(check, f)
    case "tautulliPlays":
      return `Tautulli recorded no play in ${TAUTULLI_STALE_DAYS} days.`
    case "historyCovers": {
      const starts = typeof values.startAt === "string" ? `Tautulli history starts ${f.date(values.startAt)}. That is shorter` : "Tautulli history is shorter"
      return `${starts} than the ${num(values.days)}-day window of this rule.`
    }
    case "dryRuns":
      return "No finished dry run yet. Automatic needs one."
    case "firstBatchSize":
      return `Not for this first batch, because it is more than 10 % of the ${NOUNS[level][1]} checked (${num(values.count)} of ${num(values.checked)}). ` +
        "After the first batch, change the mode."
    case "grace":
      return automaticGraceMessage(num(values.min))
    default:
      return CLEANUP_ERRORS.CLEANUP_REVIEW_STALE
  }
}
