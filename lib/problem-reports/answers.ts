/**
 * The words for an answer that takes the place of a report
 * (`decideMissingForMember`, `decideBetterCopyForMember`), on the web and in
 * Discord. Each caller passes how it writes a day ("Nov 14"): the browser's
 * own zone on the web, the server's in Discord.
 *
 * @example
 * ```ts
 * answerWords({ kind: "NOT_ON_SERVER", seasons: [3, 4], requestHref: null }, () => "") // "Seasons 3 and 4 aren't on the server."
 * ```
 *
 * @module lib/problem-reports/answers
 */

import type { BetterCopyAnswer } from "@/lib/problem-reports/report-better-copy"
import type { MissingAnswer } from "@/lib/problem-reports/report-missing"

/** An answer the app gives instead of filing a report. */
export type ReportAnswer = MissingAnswer | BetterCopyAnswer

/** "3", "3 and 4", "2, 3 and 4". */
function list(numbers: readonly number[]): string {
  if (numbers.length < 2) return numbers.join("")
  return `${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`
}

/** The sentence for an answer; `day` writes an ISO time as a day. */
export function answerWords(answer: ReportAnswer, day: (iso: string) => string): string {
  if (answer.kind === "BEST_COPY") return "This is the best copy the server keeps."
  if (answer.kind === "NOT_AIRED") {
    const which = `Season ${answer.season}, episode ${answer.episode}`
    return answer.airsAt ? `${which} comes out ${day(answer.airsAt)}.` : `${which} hasn't aired yet.`
  }
  return answer.seasons.length === 1 ? `Season ${answer.seasons[0]} isn't on the server.` : `Seasons ${list(answer.seasons)} aren't on the server.`
}
