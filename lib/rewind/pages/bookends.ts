/**
 * 03 Bookends (design 4.3): how the year opened and where it is now. Omitted
 * when the first and last counted plays are the same title on the same day.
 * A bookend that is the No. 1 series is masked, so the quiz on page 04 and
 * the reveal on page 05 are not spoiled.
 *
 * @module lib/rewind/pages/bookends
 */

import type { PageDefinition } from "@/lib/rewind/registry"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { BookendsDataSchema, type BookendsData } from "./bookends.schema"
import { isFinalCut, issueYear, shown } from "./facts"

/** What a masked bookend reads in place of its title. */
export const maskedTitle = (topShowsFolio: number) => `a series you will meet on page ${String(topShowsFolio).padStart(2, "0")}`

function end(facts: RewindFactsV3, side: "first" | "last", masked: boolean): string {
  const title = masked ? "a series you will meet on the Top shows page" : shown(facts, `bookends.${side}.title`)
  return `${title}, on ${shown(facts, `bookends.${side}.date`)} at ${shown(facts, `bookends.${side}.time`)}`
}

export const bookendsPage: PageDefinition<BookendsData> = {
  select: (_facts, { stats }) => {
    const { first, last, sameTitleSameDay } = stats.bookends
    if (!first || !last || sameTitleSameDay) return null
    const top = stats.titles.series[0]?.key
    return { first: { key: first.key, masked: first.key === top }, last: { key: last.key, masked: last.key === top } }
  },
  schema: BookendsDataSchema,
  srSummary: (data, facts) => {
    const closing = isFinalCut(facts) ? "It closed with" : "The latest was"
    return `${issueYear(facts)} opened with ${end(facts, "first", data.first.masked)}. ${closing} ${end(facts, "last", data.last.masked)}.`
  },
  share: {
    facts: ["bookends.first.title", "bookends.first.date", "bookends.last.title", "bookends.last.date", "member.since"],
    titles: ["bookends.first.title", "bookends.last.title"],
  },
}
