/**
 * 05 Top shows (design 4.3): the member's series by minutes, No. 1 as a
 * feature with its poster and rows 2 to 5 beneath, each with an 11-month
 * small multiple on one shared scale. One series is a single feature; no
 * series omits the page.
 *
 * @module lib/rewind/pages/top-shows
 */

import { formatRewindDuration } from "@/lib/rewind/format"
import type { PageDefinition } from "@/lib/rewind/registry"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { isFinalCut, shown } from "./facts"
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

export const topShowsPage: PageDefinition<TopShowsData> = {
  select: (_facts, { stats }) => {
    const series = stats.titles.series
    return series.length === 0 ? null : { rows: series.map((s) => ({ key: s.key, monthly: s.monthly })) }
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
  share: {
    facts: [1, 2, 3, 4, 5].flatMap((n) => [`series[${n}].title`, `series[${n}].minutes`] as FactId[]),
    titles: [1, 2, 3, 4, 5].map((n) => `series[${n}].title` as FactId),
    art: true,
  },
}
