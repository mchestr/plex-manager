/**
 * 03 Bookends (design 4.3): how the year opened and where it is now. Omitted
 * when the first and last counted plays are the same title on the same day.
 * A bookend that is the No. 1 series is masked, so the quiz on page 04 and
 * the reveal on page 05 are not spoiled.
 *
 * @module lib/rewind/pages/bookends
 */

import { deckBlock, heading, plain, type ArticleBlock } from "@/lib/rewind/article/blocks"
import { formatCount } from "@/lib/rewind/format"
import type { PageDefinition } from "@/lib/rewind/registry"
import { copyLocals, headline } from "@/lib/wrapped/copy/templates"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { BookendsDataSchema, type BookendsData } from "./bookends.schema"
import { pageDeck } from "./deck"
import { has, isWholeYear, issueYear, num, shown } from "./facts"
import { ratingKeyOf } from "./title-key"

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"]

/** `series:77` to `77`: the rating key a hidden title is stored under. */

/** What a masked bookend reads in place of its title. */
export const maskedTitle = (topShowsFolio: number) => `a series you will meet on page ${String(topShowsFolio).padStart(2, "0")}`

/** The lead of the second block: the latest play, or the last in a whole-year issue. */
export const lastLead = (facts: RewindFactsV3) => (isWholeYear(facts) ? "And you closed it with" : "And most recently,")

/** "Member since 2023, 3,940 hours in all, your fourth Rewind", from whichever facts the member has. */
export function lifetimeLine(facts: RewindFactsV3, locale: string): string | null {
  const nth = num(facts, "member.nthRewind")
  const parts = [
    has(facts, "member.since") && `Member since ${shown(facts, "member.since")}`,
    num(facts, "member.lifetimeHours") > 0 && `${formatCount(num(facts, "member.lifetimeHours"), { one: "hour", other: "hours" }, { locale })} in all`,
    nth > 0 && `your ${ORDINALS[nth - 1] ?? `${shown(facts, "member.nthRewind")}th`} Rewind`,
  ].filter((part): part is string => typeof part === "string")
  return parts.length > 0 ? parts.join(", ") : null
}

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
    const closing = isWholeYear(facts) ? "It closed with" : "The latest was"
    return `${issueYear(facts)} opened with ${end(facts, "first", data.first.masked)}. ${closing} ${end(facts, "last", data.last.masked)}.`
  },
  article: (data, facts, ctx) => {
    const topShows = ctx.pages.find((page) => page.type === "top-shows")?.folio ?? 0
    const title = (side: "first" | "last") => (data[side].masked ? maskedTitle(topShows) : shown(facts, `bookends.${side}.title`))
    const when = (side: "first" | "last") => `${shown(facts, `bookends.${side}.date`)}, ${shown(facts, `bookends.${side}.time`)}`
    const lifetime = lifetimeLine(facts, ctx.locale)
    const blocks: ArticleBlock[] = [
      heading(headline("bookends", facts), { ...facts, ...copyLocals({ year: ctx.year, firstTitle: title("first") }) }),
      ...deckBlock(pageDeck(ctx, facts, "bookends"), facts, lifetime ? ["member.since", "member.lifetimeHours", "member.nthRewind"] : []),
      {
        kind: "definitionList",
        entries: [
          // The headline names the first title.
          { term: "First play", detail: plain(when("first")) },
          { term: isWholeYear(facts) ? "Last play" : "Latest play", detail: plain(`${title("last")}, ${when("last")}`) },
        ],
      },
    ]
    if (lifetime) blocks.push({ kind: "paragraph", text: plain(lifetime) })
    return blocks
  },
  share: {
    facts: ["bookends.first.title", "bookends.first.date", "bookends.last.title", "bookends.last.date", "member.since"],
    titles: ["bookends.first.title", "bookends.last.title"],
    // A masked bookend is the No. 1 series, so its key is also `series[1].title`'s.
    titleKeys: ({ first, last }) => ({
      "bookends.first.title": ratingKeyOf(first.key),
      "bookends.last.title": ratingKeyOf(last.key),
      ...(first.masked ? { "series[1].title": ratingKeyOf(first.key) } : last.masked ? { "series[1].title": ratingKeyOf(last.key) } : {}),
    }),
  },
}
