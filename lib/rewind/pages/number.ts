/**
 * 02 The number (design 4.3): the year's total as one hero numeral, its
 * split, its counts and the road to it. Kept whenever the member has any
 * watch time; the hero is whole hours from 10 hours, else the duration.
 *
 * @module lib/rewind/pages/number
 */

import { deckBlock, heading, plain, tableBlock, type ArticleBlock, type ArticleContext } from "@/lib/rewind/article/blocks"
import { formatRewindDuration, pluralWord } from "@/lib/rewind/format"
import type { PageDefinition, PageTable } from "@/lib/rewind/registry"
import { headline } from "@/lib/wrapped/copy/templates"
import { display } from "@/lib/wrapped/facts/display"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { pageDeck } from "./deck"
import { has, isWholeYear, issueYear, num, shown } from "./facts"
import { NumberDataSchema, type NumberData } from "./number.schema"

const HERO_HOURS = 10
const MILESTONES = [1, 2, 3, 4] as const
const DAY_MS = 86_400_000

/** The counts row under the split, in order. */
export const NUMBER_COUNTS: ReadonlyArray<[FactId, { one: string; other: string }]> = [
  ["counts.episodes", { one: "episode", other: "episodes" }],
  ["counts.series", { one: "series", other: "series" }],
  ["counts.films", { one: "film", other: "films" }],
]

/** "872 h, 67%", or "4%" under an hour: one side of the series and films split. */
export function splitShare(facts: RewindFactsV3, side: "series" | "films"): string {
  const hours: FactId = side === "series" ? "time.seriesHours" : "time.filmsHours"
  const share: FactId = side === "series" ? "time.seriesShare" : "time.filmsShare"
  return has(facts, hours) ? `${shown(facts, hours)}\u00A0h, ${shown(facts, share)}` : shown(facts, share)
}

/** The split shows only when both sides are above zero. */
export const hasSplit = (facts: RewindFactsV3) => num(facts, "time.seriesShare") > 0 && num(facts, "time.filmsShare") > 0

/** The vs-2025 stamp's words after the change: "on 2025", or "on the same months of 2025" in the season. */
const vsLastYearLabel = (facts: RewindFactsV3) => (isWholeYear(facts) ? `on ${issueYear(facts) - 1}` : `on the same months of ${issueYear(facts) - 1}`)

/** The milestones the member passed: `{ hours, date }` displays plus the date key. */
export function milestoneFacts(facts: RewindFactsV3) {
  return MILESTONES.flatMap((n) => {
    const date = facts[`time.milestones[${n}].date`]
    const hours = facts[`time.milestones[${n}].hours`]
    return date && hours && typeof date.value === "string" ? [{ hours: hours.display, date: date.display, key: date.value }] : []
  })
}

/** "1,307 hours", or the duration under 10 hours: the hero as a sentence reads it. */
function heroText(data: NumberData, facts: RewindFactsV3): string {
  return data.hero === "time.totalHours" ? `${shown(facts, data.hero)} hours` : shown(facts, data.hero)
}

function monthlyMinutes(minutes: readonly number[], from: string): Map<number, number> {
  const start = Date.parse(`${from}T00:00:00Z`)
  const months = new Map<number, number>()
  minutes.forEach((m, i) => {
    const month = new Date(start + i * DAY_MS).getUTCMonth() + 1
    months.set(month, (months.get(month) ?? 0) + m)
  })
  return months
}

/** The hero in the headline, the stamp, the deck, the split, the counts and the road's Table, whose milestones the summary would repeat. */
function numberArticle(data: NumberData, facts: RewindFactsV3, ctx: ArticleContext): ArticleBlock[] {
  const hours = data.hero === "time.totalHours"
  const stamp: ArticleBlock[] = has(facts, "time.vsLastYear")
    ? [{ kind: "factRow", items: [{ value: shown(facts, "time.vsLastYear"), label: vsLastYearLabel(facts) }] }]
    : []
  const split: ArticleBlock[] = hasSplit(facts)
    ? [
        {
          kind: "definitionList",
          label: "Series and films",
          entries: [
            { term: "Series", detail: plain(splitShare(facts, "series")) },
            { term: "Films", detail: plain(splitShare(facts, "films")) },
          ],
        },
      ]
    : []
  const counted = NUMBER_COUNTS.filter(([id]) => num(facts, id) > 0)
  const counts = counted.map(([id, forms]) => ({ value: shown(facts, id), label: pluralWord(num(facts, id), forms, ctx) }))
  const printed: FactId[] = [
    data.hero,
    ...(stamp.length > 0 ? (["time.vsLastYear"] as const) : []),
    ...(split.length > 0 ? (["time.seriesHours", "time.seriesShare", "time.filmsHours", "time.filmsShare"] as const) : []),
    ...counted.map(([id]) => id),
  ]
  return [
    heading(`${headline("number", facts)} {{fact:${data.hero}}}${hours ? " hours" : ""}`, facts),
    ...stamp,
    ...deckBlock(pageDeck(ctx, facts, "number"), facts, printed),
    ...split,
    ...(counts.length > 0 ? [{ kind: "factRow" as const, items: counts }] : []),
    ...tableBlock(hoursByMonth(data, facts, ctx, { playedOnly: true })),
  ]
}

/** Watch time and milestones by month; article mode leaves out the months with no plays, the story's Table keeps them. */
function hoursByMonth(data: NumberData, facts: RewindFactsV3, settings: { locale: string }, { playedOnly = false } = {}): PageTable | null {
  const from = facts["window.from"]?.value
  if (typeof from !== "string") return null
  const months = [...monthlyMinutes(data.minutes, from)].filter(([, minutes]) => !playedOnly || minutes > 0)
  const marks = milestoneFacts(facts)
  const rows = months.map(([month, minutes]) => {
    const passed = marks.filter((m) => Number(m.key.slice(5, 7)) === month).map((m) => `${m.hours} hours on ${m.date}`)
    return [display("month", month, settings), formatRewindDuration(minutes, settings), passed.join(", ")]
  })
  return { caption: "Hours by month", columns: ["Month", "Watched", "Milestones"], rows }
}

export const numberPage: PageDefinition<NumberData> = {
  select: (facts, { stats }) => {
    if (!has(facts, "time.totalMinutes")) return null
    const hero: FactId = num(facts, "time.totalHours") >= HERO_HOURS ? "time.totalHours" : "time.totalMinutes"
    const lastYearDaily = stats.totals.minutes2025
    return { hero, minutes: stats.calendar.minutes.map((day) => day.minutes), ...(lastYearDaily ? { lastYearDaily } : {}) }
  },
  schema: NumberDataSchema,
  srSummary: (data, facts) => {
    const parts = [`${heroText(data, facts)} of film and television`]
    if (has(facts, "time.seriesHours") && has(facts, "time.filmsHours")) {
      parts.push(`${shown(facts, "time.seriesHours")} hours of series and ${shown(facts, "time.filmsHours")} hours of films`)
    }
    const marks = milestoneFacts(facts).map((m) => `${m.hours} hours on ${m.date}`)
    if (marks.length > 0) parts.push(`passing ${marks.join(", ")}`)
    return `${parts.join(", ")}.`
  },
  table: (data, facts, settings) => hoursByMonth(data, facts, settings),
  article: numberArticle,
  share: { facts: ["time.totalHours", "time.totalMinutes", "window.through", "window.finalCut"] },
}
