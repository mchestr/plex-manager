/**
 * 01 Cover (design 4.3): always present. Its data is the soundtrack's daily
 * minutes; the masthead, data window and cover lines read facts and the
 * selected page list at render.
 *
 * @module lib/rewind/pages/cover
 */

import { figure, heading, plain, type ArticleBlock } from "@/lib/rewind/article/blocks"
import type { PageDefinition } from "@/lib/rewind/registry"
import { copyLocals, coverLines, headline } from "@/lib/wrapped/copy/templates"

import { CoverDataSchema, type CoverData } from "./cover.schema"
import { has, isFinalCut, issueYear, shown } from "./facts"

/** The soundtrack's caption, under the cover's graphic. */
export const coverCaption = (finalCut: boolean) => `Every line is a day you pressed play.${finalCut ? "" : " December is still being written."}`

export const coverPage: PageDefinition<CoverData> = {
  select: (_facts, { stats }) => ({ minutes: stats.calendar.minutes.map((day) => day.minutes) }),
  schema: CoverDataSchema,
  srSummary: (data, facts) => {
    const days = has(facts, "days.active") ? shown(facts, "days.active") : "0"
    return `The soundtrack of ${issueYear(facts)}: one line for each day, ${days} of ${data.minutes.length} days with something played.`
  },
  article: (data, facts, ctx) => {
    const source = { ...facts, ...copyLocals({ year: ctx.year }) }
    const pocket: ArticleBlock[] = ctx.edition === "pocket" ? [{ kind: "paragraph", text: plain("The pocket edition") }] : []
    const lines = coverLines(ctx.pages)
    return [
      heading(headline("cover", facts), source),
      ...pocket,
      ...figure(coverPage.srSummary(data, facts)),
      { kind: "note", text: plain(coverCaption(isFinalCut(facts))) },
      ...(lines.length > 0 ? [{ kind: "rankedList" as const, label: "In this issue", items: lines.map((line) => ({ rank: line.folio, title: line.text })) }] : []),
    ]
  },
  share: { facts: ["member.volume", "member.serial", "window.through", "window.finalCut"] },
}
