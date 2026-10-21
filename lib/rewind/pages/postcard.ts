/**
 * The postcard (design 4.5): the whole issue of a member with under 30
 * minutes or no counted plays. One paper page, "A quiet year on {server}",
 * the member's total in minutes when there is one, up to three titles that
 * 3 or more members watched (no names, no counts) and "Browse the library".
 * Template-only, with no archetype and no model call (RWP-19). The player
 * treats it as one page in the `ended` state.
 *
 * @module lib/rewind/pages/postcard
 */

import { paragraph, plain, type ArticleBlock } from "@/lib/rewind/article/blocks"
import type { PageDefinition } from "@/lib/rewind/registry"
import { postcardHeadline } from "@/lib/wrapped/copy/templates"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { num, shown } from "./facts"
import { PostcardDataSchema, type PostcardData } from "./postcard.schema"

/** The minutes line, or null when the member has no minutes: a postcard never prints "0 minutes". */
export function postcardMinutes(facts: RewindFactsV3): string | null {
  return num(facts, "time.totalMinutes") > 0 ? "You pressed play for {{fact:time.totalMinutes}} this year." : null
}

/** The heading over the community titles. */
export const POSTCARD_TITLES_LABEL = "Watched by three or more of us"

export const postcardPage: PageDefinition<PostcardData> = {
  select: (_facts, { stats }) => ({ titles: stats.popular }),
  schema: PostcardDataSchema,
  srSummary: (data, facts) => {
    const minutes = num(facts, "time.totalMinutes") > 0 ? `You watched ${shown(facts, "time.totalMinutes")}. ` : ""
    const titles = data.titles.length > 0 ? `${POSTCARD_TITLES_LABEL}: ${data.titles.map((t) => t.title).join("; ")}.` : ""
    return `${minutes}${titles}`.trim()
  },
  article: (data, facts, ctx) => {
    const minutes = postcardMinutes(facts)
    const blocks: ArticleBlock[] = [{ kind: "heading", text: plain(postcardHeadline(ctx.serverName)) }]
    if (minutes) blocks.push(paragraph(minutes, facts))
    if (data.titles.length > 0) {
      blocks.push({ kind: "rankedList", label: POSTCARD_TITLES_LABEL, items: data.titles.map((t, i) => ({ rank: i + 1, title: t.title })) })
    }
    return blocks
  },
  // P7.6 adds the postcard's card, which prints no numbers.
  share: { facts: [] },
}
