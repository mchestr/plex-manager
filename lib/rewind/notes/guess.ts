/**
 * 04 Guess's Notes (P8.4): only the rules until the quiz is answered or
 * skipped in this session, then the top four with their minutes, so the
 * Notes never spoil the quiz.
 *
 * @module lib/rewind/notes/guess
 */

import type { GuessData } from "@/lib/rewind/pages/guess.schema"
import { shown } from "@/lib/rewind/pages/facts"
import { ratingKeyOf } from "@/lib/rewind/pages/title-key"
import type { FactId } from "@/lib/wrapped/facts/catalogue"

import { headingBlock, paragraphBlock, windowRange, type CoreNotes } from "./context"

export const guessNotes: CoreNotes<GuessData> = (data, facts, ctx) => {
  const what = data.kind === "series" ? "series" : "title, film or series,"
  const rules = paragraphBlock(
    `Pick the ${what} you watched most from ${windowRange(facts)}. The ${data.options.length} choices are your top ${data.kind === "series" ? "series" : "titles"} by time watched, in a fixed order. You can skip the quiz. Your answer stays on this device.`
  )
  if (!ctx.quizAnswered) return [headingBlock("How the quiz works"), rules]
  const ranked = data.options.filter((option) => !ctx.hiddenKeys?.has(ratingKeyOf(option.key))).sort((a, b) => a.rank - b.rank)
  return [
    headingBlock("The answer"),
    {
      kind: "rankedList",
      label: data.kind === "series" ? "Your top series by time watched" : "Your top titles by time watched",
      items: ranked.map((option) => ({ rank: option.rank, title: option.title, ...(option.minutes ? { detail: shown(facts, option.minutes as FactId) } : {}) })),
    },
    rules,
  ]
}
