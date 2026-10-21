/**
 * 05 Top shows (design 4.3): the member's series by minutes, No. 1 as a
 * feature with its poster and rows 2 to 5 beneath, each with an 11-month
 * small multiple on one shared scale. One series is a single feature; no
 * series omits the page.
 *
 * @module lib/rewind/pages/top-shows
 */

import { plain, type ArticleBlock } from "@/lib/rewind/article/blocks"
import { formatHero, formatRewindDuration } from "@/lib/rewind/format"
import type { NotesContext, PageDefinition } from "@/lib/rewind/registry"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { isFinalCut, shown } from "./facts"
import { ratingKeyOf } from "./title-key.schema"
import { TopShowsDataSchema, type TopShowsData } from "./top-lists.schema"

/** A row's fact: `series[n].title` for the row at index n - 1. */
export const seriesFact = (i: number, field: string) => `series[${i + 1}].${field}` as FactId
export const filmFact = (i: number, field: string) => `films[${i + 1}].${field}` as FactId

/** Months the window counts: 12 after the final cut, else through `window.through`'s month. */
export function countedMonths(facts: RewindFactsV3): number {
  if (isFinalCut(facts)) return 12
  const through = facts["window.through"]?.value
  return typeof through === "string" ? Number(through.slice(5, 7)) : 12
}

/** "September" or "Sep". */
export const monthName = (month: number, locale: string, style: "long" | "short") =>
  new Intl.DateTimeFormat(locale, { month: style, timeZone: "UTC" }).format(Date.UTC(2026, month - 1, 1))

/**
 * How a list counts, for the desktop Notes: "Counted from January 1 to
 * November 30 in America/Chicago, the server’s time zone. Rewatches count;
 * trailers and extras do not."
 */
function countingRule(facts: RewindFactsV3, zone: NotesContext["zone"]): string {
  const whose = zone === "server" ? "the server’s time zone" : "your time zone"
  return `Counted from ${shown(facts, "window.from")} to ${shown(facts, "window.through")} in ${shown(facts, "tz.label")}, ${whose}. Rewatches count; trailers and extras do not.`
}

/**
 * Top shows' Notes: every listed series as a table, under the counting rule
 * (design 4.7). A series the member hid since the issue was stored is left
 * out at once; the no-LLM regeneration then drops it from `more` (P7.7).
 */
function topShowsNotes(data: TopShowsData, facts: RewindFactsV3, ctx: NotesContext): ArticleBlock[] {
  const count = { format: (n: number) => formatHero(n, ctx) }
  const shownKey = (key: string) => !ctx.hiddenKeys?.has(ratingKeyOf(key))
  const top = data.rows.flatMap((row, i) =>
    shownKey(row.key) ? [[shown(facts, seriesFact(i, "title")), shown(facts, seriesFact(i, "episodes")), shown(facts, seriesFact(i, "minutes"))]] : []
  )
  const more = (data.more ?? []).filter((row) => shownKey(row.key)).map((row) => [row.title, count.format(row.episodes), formatRewindDuration(row.minutes, ctx)])
  const rows = [...top, ...more].map((row, i) => [count.format(i + 1), ...row])
  if (rows.length === 0) return []
  const title = rows.length === 1 ? "Your one series" : `All ${count.format(rows.length)} series, ranked by time watched`
  return [
    { kind: "heading", text: plain(title) },
    { kind: "paragraph", text: plain(countingRule(facts, ctx.zone)) },
    { kind: "table", table: { caption: `${title}.`, columns: ["No.", "Series", "Episodes", "Watched"], rows } },
  ]
}

export const topShowsPage: PageDefinition<TopShowsData> = {
  select: (_facts, { stats }) => {
    const series = stats.titles.series
    if (series.length === 0) return null
    const more = stats.titles.moreSeries
    return { rows: series.map((s) => ({ key: s.key, monthly: s.monthly })), ...(more.length > 0 ? { more } : {}) }
  },
  schema: TopShowsDataSchema,
  srSummary: (data, facts) => {
    const rows = data.rows.map((_row, i) => `${shown(facts, seriesFact(i, "title"))}, ${shown(facts, seriesFact(i, "minutes"))}`)
    return rows.length === 1 ? `Your series of the year: ${rows[0]}.` : `Your top series: ${rows.join("; ")}.`
  },
  table: (data, facts, settings) => {
    const months = countedMonths(facts)
    return {
      caption: `Minutes of each series by month, from ${shown(facts, "window.from")} to ${shown(facts, "window.through")}.`,
      columns: ["Series", ...Array.from({ length: months }, (_, m) => monthName(m + 1, settings.locale, "short")), "In all"],
      rows: data.rows.map((row, i) => [
        shown(facts, seriesFact(i, "title")),
        ...row.monthly.slice(0, months).map((minutes) => (minutes > 0 ? formatRewindDuration(minutes, settings) : "")),
        shown(facts, seriesFact(i, "minutes")),
      ]),
    }
  },
  notes: topShowsNotes,
  share: {
    facts: [1, 2, 3, 4, 5].flatMap((n) => [`series[${n}].title`, `series[${n}].minutes`] as FactId[]),
    titles: [1, 2, 3, 4, 5].map((n) => `series[${n}].title` as FactId),
    art: true,
    titleKeys: ({ rows }) => Object.fromEntries(rows.map((row, i) => [`series[${i + 1}].title`, ratingKeyOf(row.key)])),
  },
}
