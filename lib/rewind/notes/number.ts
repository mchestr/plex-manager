/**
 * 02 The number's Notes (P8.4): the counting rule, both years' minutes by
 * month over the same window, the milestone dates, and how last year was
 * recounted.
 *
 * @module lib/rewind/notes/number
 */

import type { ArticleBlock } from "@/lib/rewind/article/blocks"
import { formatRewindDuration } from "@/lib/rewind/format"
import { issueYear } from "@/lib/rewind/pages/facts"
import { milestoneFacts } from "@/lib/rewind/pages/number"
import type { NumberData } from "@/lib/rewind/pages/number.schema"
import { display } from "@/lib/wrapped/facts/display"

import { headingBlock, paragraphBlock, windowRange, type CoreNotes } from "./context"

const DAY_MS = 86_400_000

/** Minutes per calendar month (1-12) of a daily series starting at `from`. */
function byMonth(minutes: readonly number[], from: string): Map<number, number> {
  const start = Date.parse(`${from}T00:00:00Z`)
  const months = new Map<number, number>()
  minutes.forEach((m, i) => {
    const month = new Date(start + i * DAY_MS).getUTCMonth() + 1
    months.set(month, (months.get(month) ?? 0) + m)
  })
  return months
}

export const numberNotes: CoreNotes<NumberData> = (data, facts, ctx) => {
  const year = issueYear(facts)
  const from = String(facts["window.from"]?.value)
  const current = byMonth(data.minutes, from)
  const last = data.lastYearDaily && data.lastYearDaily.some((m) => m > 0) ? byMonth(data.lastYearDaily, `${year - 1}${from.slice(4)}`) : null
  const rows = [...current].map(([month, minutes]) => [
    display("month", month, ctx),
    formatRewindDuration(minutes, ctx),
    ...(last ? [formatRewindDuration(last.get(month) ?? 0, ctx)] : []),
  ])
  const marks = milestoneFacts(facts)
  const blocks: ArticleBlock[] = [
    headingBlock("How the hours are counted"),
    paragraphBlock(
      `Every movie and episode you played from ${windowRange(facts)}. A play counts from its first minute. Rewatches count. Trailers and extras do not.`
    ),
    {
      kind: "table",
      table: {
        caption: last ? `Watch time by month, ${year} and ${year - 1}, over the same window.` : `Watch time by month in ${year}.`,
        columns: ["Month", String(year), ...(last ? [String(year - 1)] : [])],
        rows,
      },
    },
  ]
  if (marks.length > 0) {
    blocks.push({ kind: "definitionList", label: "Milestones", entries: marks.map((m) => ({ term: `${m.hours} hours`, detail: [{ kind: "text", text: m.date }] })) })
  }
  if (last) {
    blocks.push(
      paragraphBlock(
        `${year - 1} is counted again from your play history, with this year’s rules and the same days. The result can differ from last year’s Rewind.`
      )
    )
  }
  return blocks
}
