/**
 * 02 The number (design 4.3): the year's total as one hero numeral, its
 * split, its counts and the road to it. Kept whenever the member has any
 * watch time; the hero is whole hours from 10 hours, else the duration.
 *
 * @module lib/rewind/pages/number
 */

import { formatRewindDuration } from "@/lib/rewind/format"
import type { PageDefinition } from "@/lib/rewind/registry"
import { display } from "@/lib/wrapped/facts/display"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { has, num, shown } from "./facts"
import { NumberDataSchema, type NumberData } from "./number.schema"

const HERO_HOURS = 10
const MILESTONES = [1, 2, 3, 4] as const
const DAY_MS = 86_400_000

/** The milestones the member passed: `{ hours, date }` displays plus the date key. */
export function milestoneFacts(facts: RewindFactsV3) {
  return MILESTONES.flatMap((n) => {
    const date = facts[`time.milestones[${n}].date`]
    const hours = facts[`time.milestones[${n}].hours`]
    return date && hours && typeof date.value === "string" ? [{ hours: hours.display, date: date.display, key: date.value }] : []
  })
}

/** "1,307 hours", or the duration under 10 hours: the hero as a sentence reads it. */
export function heroText(data: NumberData, facts: RewindFactsV3): string {
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

export const numberPage: PageDefinition<NumberData> = {
  select: (facts, { stats }) => {
    if (!has(facts, "time.totalMinutes")) return null
    const hero: FactId = num(facts, "time.totalHours") >= HERO_HOURS ? "time.totalHours" : "time.totalMinutes"
    return { hero, minutes: stats.calendar.minutes.map((day) => day.minutes) }
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
  table: (data, facts, settings) => {
    const from = facts["window.from"]?.value
    if (typeof from !== "string") return null
    const months = monthlyMinutes(data.minutes, from)
    const marks = milestoneFacts(facts)
    const rows = [...months].map(([month, minutes]) => {
      const passed = marks.filter((m) => Number(m.key.slice(5, 7)) === month).map((m) => `${m.hours} hours on ${m.date}`)
      return [display("month", month, settings), formatRewindDuration(minutes, settings), passed.join(", ")]
    })
    return {
      caption: `Watch time by month from ${shown(facts, "window.from")} to ${shown(facts, "window.through")}, counted in ${shown(facts, "tz.label")}.`,
      columns: ["Month", "Watched", "Milestones"],
      rows,
    }
  },
  share: { facts: ["time.totalHours", "time.totalMinutes", "window.through", "window.finalCut"] },
}
