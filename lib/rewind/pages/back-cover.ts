/**
 * 18 Back cover (design 4.3): the whole year on one page, then sharing and a
 * clean exit. Always kept. Its data is the soundtrack's daily minutes; the
 * billing block (`lib/rewind/billing-block.ts`) reads facts and the selected
 * list at render.
 *
 * @module lib/rewind/pages/back-cover
 */

import { figure, heading, paragraph, plain, type ArticleBlock } from "@/lib/rewind/article/blocks"
import { billingBlock } from "@/lib/rewind/billing-block"
import { backCoverDisclosure } from "@/lib/rewind/copy-disclosure"
import { formatDayMonth } from "@/lib/rewind/format"
import type { PageDefinition } from "@/lib/rewind/registry"
import { copyLocals, headline } from "@/lib/wrapped/copy/templates"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { BackCoverDataSchema, type BackCoverData } from "./back-cover.schema"
import { has, isFinalCut, issueYear, shown, volumeLine } from "./facts"
import { ratingKeyOf } from "./title-key.schema"

/** The page's measure in artboard px; the billing block's lines are justified to it. */
const MEASURE = 358

/** The soundtrack's caption: the season's promise of the final cut, or the whole year. */
export function backCoverCaption(facts: RewindFactsV3, year: number, locale: string): string {
  return isFinalCut(facts)
    ? "One line per day, the whole year."
    : `One line per day. December is still being written; it joins in the final cut on ${formatDayMonth(`${year + 1}-01-01`, { locale })}.`
}

/** "Chester Family Plex Rewind 2026, Vol. 4, No. K7Q4". */
export const colophon = (facts: RewindFactsV3, issue: { serverName: string; year: number }) =>
  [`${issue.serverName} Rewind ${issue.year}`, volumeLine(facts)].filter(Boolean).join(", ")

export const backCoverPage: PageDefinition<BackCoverData> = {
  select: (_facts, { stats }) => ({
    minutes: stats.calendar.minutes.map((day) => day.minutes),
    keys: { series: stats.titles.series.slice(0, 3).map((s) => s.key), film: stats.titles.films[0]?.key ?? null },
  }),
  schema: BackCoverDataSchema,
  srSummary: (data, facts) => {
    const days = has(facts, "days.active") ? shown(facts, "days.active") : "0"
    return `The soundtrack of ${issueYear(facts)} again: one line for each day, ${days} of ${data.minutes.length} days with something played.`
  },
  article: (data, facts, ctx) => {
    const block = billingBlock(facts, {
      serverName: ctx.serverName,
      named: true,
      showtime: ctx.pages.some((page) => page.type === "clock"),
      locale: ctx.locale,
      measure: MEASURE,
      metrics: ctx.metrics,
    })
    const signOff = ctx.copy?.signOff
    const blocks: ArticleBlock[] = [
      heading(headline("back-cover", facts), { ...facts, ...copyLocals({ year: ctx.year }) }),
      { kind: "definitionList", label: "The billing", entries: block.entries.map((entry) => ({ term: entry.term, detail: plain(entry.detail) })) },
      ...figure(backCoverPage.srSummary(data, facts)),
      { kind: "note", text: plain(backCoverCaption(facts, ctx.year, ctx.locale)) },
    ]
    if (signOff) blocks.push(paragraph(signOff, facts))
    return [...blocks, { kind: "paragraph", text: plain(backCoverDisclosure(ctx.copySource)) }, { kind: "note", text: plain(colophon(facts, ctx)) }]
  },
  share: {
    facts: [
      "time.totalHours",
      "counts.episodes",
      "counts.films",
      "series[1].title",
      "series[2].title",
      "series[3].title",
      "films[1].title",
      "hours.peak",
      "streak.longest.days",
      "standing.percentile",
      "archetype.name",
    ],
    titles: ["series[1].title", "series[2].title", "series[3].title", "films[1].title"],
    art: true,
    titleKeys: ({ keys }) => ({
      ...Object.fromEntries(keys.series.map((key, i) => [`series[${i + 1}].title`, ratingKeyOf(key)])),
      ...(keys.film ? { "films[1].title": ratingKeyOf(keys.film) } : {}),
    }),
  },
}
