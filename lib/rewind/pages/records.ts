/**
 * 12 Records (design 4.3): a 2x2 box score of personal bests from P2.7's
 * session facts, each cell a fitted numeral and a label.
 *
 * ## Cells, in catalogue order
 *
 * | Cell | Qualifies with | Numeral |
 * |---|---|---|
 * | `binge` | a binge of 3 episodes or more | `records.longestBinge.episodes` |
 * | `day` | 3 episodes or more in a day | `records.mostEpisodesDay` |
 * | `week` | a week of 5 hours or more | `days.biggestWeek` |
 * | `completion` | 5 or more titles started | `records.completionShare` |
 * | `paused` | a paused title | its paused minutes (no fact holds them) |
 * | `latest` | a start from 11 PM to 4 AM | `hours.latestStart.time` |
 *
 * The page rule (design 4.3, pinned by the hand-checked goldens) counts
 * the four personal bests: the page is omitted unless 2 of `binge`, `day`,
 * `completion` and `paused` qualify. The biggest week and the latest start
 * then fill the box like any other cell: the first four cells that qualify
 * print, in catalogue order. The "record" stamp marks the cell furthest
 * above its server median (`aggregate.medians`), which exists only with 10
 * or more scored members.
 *
 * @module lib/rewind/pages/records
 */

import { deckBlock, heading, plain } from "@/lib/rewind/article/blocks"
import { formatRewindDuration, pluralWord } from "@/lib/rewind/format"
import type { PageDefinition } from "@/lib/rewind/registry"
import { headline } from "@/lib/wrapped/copy/templates"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { pageDeck } from "./deck"
import { has, num, shown } from "./facts"
import { RECORD_CELLS, RecordsDataSchema, type RecordCell, type RecordsData } from "./records.schema"
import { ratingKeyOf } from "./title-key"

/** A binge, and a day's episodes, need 3 or more. */
const RECORD_MIN_EPISODES = 3
/** The biggest week needs 5 hours. */
const RECORD_MIN_WEEK_MINUTES = 300
const MAX_CELLS = 4
const MIN_CELLS = 2
/** The cells the page rule counts. */
const COUNTED: readonly RecordCell[] = ["binge", "day", "completion", "paused"]
/** 11 PM to 4 AM, in minutes after midnight. */
const LATE_FROM = 23 * 60
const LATE_UNTIL = 4 * 60
/** Paused minutes are not a fact; they print in the copy's locale. */
const COPY_LOCALE = { locale: "en-US" }

/** The fact each cell is measured by, and its server median. */
const MEASURES: Partial<Record<RecordCell, { value: FactId; median: FactId }>> = {
  binge: { value: "records.longestBinge.episodes", median: "records.longestBinge.median" },
  day: { value: "records.mostEpisodesDay", median: "records.mostEpisodesDay.median" },
  week: { value: "days.biggestWeek", median: "days.biggestWeek.median" },
  completion: { value: "records.completionShare", median: "records.completionShare.median" },
  paused: { value: "records.mostPaused.title", median: "records.mostPaused.median" },
}

function qualifies(cell: RecordCell, facts: RewindFactsV3, pausedMinutes: number | null): boolean {
  switch (cell) {
    case "binge":
      return num(facts, "records.longestBinge.episodes") >= RECORD_MIN_EPISODES && has(facts, "records.longestBinge.title")
    case "day":
      return num(facts, "records.mostEpisodesDay") >= RECORD_MIN_EPISODES
    case "week":
      return num(facts, "days.biggestWeek") >= RECORD_MIN_WEEK_MINUTES
    case "completion":
      return has(facts, "records.completionShare")
    case "paused":
      return pausedMinutes !== null && has(facts, "records.mostPaused.title")
    case "latest": {
      if (!has(facts, "hours.latestStart.time")) return false
      const at = num(facts, "hours.latestStart.time")
      return at >= LATE_FROM || at < LATE_UNTIL
    }
  }
}

/** The cell furthest above its median, or null when none is above it or the server has no medians. */
function stampOf(cells: readonly RecordCell[], facts: RewindFactsV3, pausedMinutes: number | null): RecordCell | null {
  let best: { cell: RecordCell; ratio: number } | null = null
  for (const cell of cells) {
    const measure = MEASURES[cell]
    const median = measure ? num(facts, measure.median) : 0
    if (!measure || median <= 0) continue
    const value = cell === "paused" ? (pausedMinutes ?? 0) : num(facts, measure.value)
    const ratio = value / median
    if (ratio > 1 && (!best || ratio > best.ratio)) best = { cell, ratio }
  }
  return best?.cell ?? null
}

/** The facts each cell prints, so the article's deck never repeats one. */
const CELL_FACTS: Record<RecordCell, FactId[]> = {
  binge: ["records.longestBinge.episodes", "records.longestBinge.title"],
  day: ["records.mostEpisodesDay"],
  week: ["days.biggestWeek", "days.biggestWeek.from"],
  completion: ["records.completionShare"],
  paused: ["records.mostPaused.title"],
  latest: ["hours.latestStart.time", "hours.latestStart.weekday"],
}

/** A cell as printed: its numeral, and its label in parts (a title part sets in italics). */
export function recordCell(cell: RecordCell, data: RecordsData, facts: RewindFactsV3): { numeral: string; label: Array<{ text: string; title?: true }> } {
  const word = (id: FactId, one: string, other: string) => pluralWord(num(facts, id), { one, other }, COPY_LOCALE)
  switch (cell) {
    case "binge":
      return {
        numeral: shown(facts, "records.longestBinge.episodes"),
        label: [{ text: `${word("records.longestBinge.episodes", "episode", "episodes")} of ` }, { text: shown(facts, "records.longestBinge.title"), title: true }, { text: " in a row" }],
      }
    case "day":
      return { numeral: shown(facts, "records.mostEpisodesDay"), label: [{ text: `${word("records.mostEpisodesDay", "episode", "episodes")} in one day` }] }
    case "week":
      return {
        numeral: shown(facts, "days.biggestWeek"),
        label: [{ text: has(facts, "days.biggestWeek.from") ? `in the week of ${shown(facts, "days.biggestWeek.from")}` : "in your biggest week" }],
      }
    case "completion":
      return { numeral: shown(facts, "records.completionShare"), label: [{ text: "of what you started, finished" }] }
    case "paused":
      return {
        numeral: formatRewindDuration(data.pausedMinutes ?? 0, COPY_LOCALE),
        label: [{ text: "paused, most of it in " }, { text: shown(facts, "records.mostPaused.title"), title: true }],
      }
    case "latest":
      return {
        numeral: shown(facts, "hours.latestStart.time"),
        label: [{ text: has(facts, "hours.latestStart.weekday") ? `your latest start, on a ${shown(facts, "hours.latestStart.weekday")}` : "your latest start" }],
      }
  }
}

const cellText = (cell: RecordCell, data: RecordsData, facts: RewindFactsV3) => {
  const { numeral, label } = recordCell(cell, data, facts)
  return `${numeral} ${label.map((part) => part.text).join("")}`
}

function recordsSummary(data: RecordsData, facts: RewindFactsV3): string {
  const parts = [`Your personal bests: ${data.cells.map((cell) => cellText(cell, data, facts)).join("; ")}.`]
  if (data.stamp) parts.push(`The record stamp marks ${cellText(data.stamp, data, facts)}, the furthest above the server's median.`)
  return parts.join(" ")
}

export const recordsPage: PageDefinition<RecordsData> = {
  select: (facts, { stats }) => {
    const paused = stats.sessions.mostPaused
    const pausedMinutes = paused && paused.minutes > 0 ? paused.minutes : null
    const qualifying = RECORD_CELLS.filter((cell) => qualifies(cell, facts, pausedMinutes))
    if (qualifying.filter((cell) => COUNTED.includes(cell)).length < MIN_CELLS) return null
    const cells = qualifying.slice(0, MAX_CELLS)
    const binge = stats.sessions.longestBinge
    return {
      cells,
      stamp: stampOf(cells, facts, pausedMinutes),
      pausedMinutes: cells.includes("paused") ? pausedMinutes : null,
      bingeKey: cells.includes("binge") && binge ? binge.key : null,
      pausedKey: cells.includes("paused") && paused ? paused.key : null,
    }
  },
  schema: RecordsDataSchema,
  srSummary: recordsSummary,
  // The box score as number, then what it counts, the way the page reads.
  article: (data, facts, ctx) => [
    heading(headline("records", facts), facts),
    ...deckBlock(pageDeck(ctx, facts, "records"), facts, data.cells.flatMap((cell) => CELL_FACTS[cell])),
    {
      kind: "definitionList",
      entries: data.cells.map((cell) => {
        const { numeral, label } = recordCell(cell, data, facts)
        return { term: numeral, detail: plain(label.map((part) => part.text).join("")) }
      }),
    },
  ],
  share: {
    facts: [
      "records.longestBinge.episodes",
      "records.longestBinge.title",
      "records.mostEpisodesDay",
      "days.biggestWeek",
      "records.completionShare",
      "records.mostPaused.title",
      "hours.latestStart.time",
    ],
    titles: ["records.longestBinge.title", "records.mostPaused.title"],
    titleKeys: (data) => ({
      ...(data.bingeKey ? { "records.longestBinge.title": ratingKeyOf(data.bingeKey) } : {}),
      ...(data.pausedKey ? { "records.mostPaused.title": ratingKeyOf(data.pausedKey) } : {}),
    }),
  },
}
