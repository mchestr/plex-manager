/**
 * 09 The clock (design 4.3): when the member presses play, as the evidence
 * clock with the after-dark window bracketed, and a weekday row. Kept with
 * more than 10 counted plays; its Table lists the 24 hours.
 *
 * @module lib/rewind/pages/clock
 */

import { deckBlock, heading } from "@/lib/rewind/article/blocks"
import { formatCount, formatHour, formatShare } from "@/lib/rewind/format"
import type { PageDefinition, PageTable } from "@/lib/rewind/registry"
import { headline } from "@/lib/wrapped/copy/templates"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { ClockDataSchema, type ClockData } from "./clock.schema"
import { pageDeck } from "./deck"
import { has, shown } from "./facts"

/** Design 4.3: the clock needs more than 10 counted plays. @internal */
export const CLOCK_PLAYS = 10

/** Sunday-first weekday shares, Monday first. */
const mondayFirst = (shares: readonly number[]) => [...shares.slice(1), shares[0]]

/** The 24 hours as a table: the clock's and the centrefold's Table (P5.3 contract). */
export function hoursTable(hours: readonly number[], settings: { locale: string }): PageTable {
  const total = hours.reduce((sum, n) => sum + n, 0)
  return {
    caption: "Plays by the hour they started.",
    columns: ["Hour", "Plays", "Share"],
    rows: hours.map((n, hour) => [
      formatHour(hour, settings),
      formatCount(n, { one: "play", other: "plays" }, settings),
      total > 0 ? formatShare(n / total, settings) : "",
    ]),
  }
}

/** Article mode's parts of the day, on the archetypes' golden-hour (6 PM to 10 PM) and after-dark (10 PM to 4 AM) windows. */
const DAY_PARTS = [
  { label: "Morning", from: 4, to: 12 },
  { label: "Afternoon", from: 12, to: 18 },
  { label: "Evening", from: 18, to: 22 },
  { label: "After dark", from: 22, to: 4 },
] as const

/** The share of plays in each part of the day; a part with no plays is left out. */
function dayPartsTable(hours: readonly number[], settings: { locale: string }): PageTable {
  const total = hours.reduce((sum, n) => sum + n, 0)
  const rows = DAY_PARTS.flatMap(({ label, from, to }) => {
    const plays = hours.reduce((sum, n, h) => sum + ((from < to ? h >= from && h < to : h >= from || h < to) ? n : 0), 0)
    return plays > 0 ? [[`${label}, ${formatHour(from, settings)} to ${formatHour(to, settings)}`, formatShare(plays / total, settings)]] : []
  })
  return { caption: "Plays by time of day", columns: ["Time of day", "Share"], rows }
}

const WINDOWS: Partial<Record<FactId, string>> = {
  "hours.afterDarkShare": "between 10 PM and 4 AM",
  "hours.goldenShare": "between 6 PM and 10 PM",
}

/** The ring's text alternative, naming the share its arc brackets. */
export function ringSummary(facts: RewindFactsV3, share: FactId = "hours.afterDarkShare"): string {
  const parts = ["Plays by the hour they started."]
  if (has(facts, share)) parts.push(`${shown(facts, share)} of your plays started ${WINDOWS[share]}.`)
  if (has(facts, "hours.peak")) parts.push(`Your busiest hour was ${shown(facts, "hours.peak")}, and your quietest ${shown(facts, "hours.quietest")}.`)
  return parts.join(" ")
}

export const clockPage: PageDefinition<ClockData> = {
  select: (_facts, { stats }) =>
    stats.plays > CLOCK_PLAYS && stats.time.peak !== null ? { hours: [...stats.time.histogram], weekdays: mondayFirst(stats.time.weekdayShare) } : null,
  schema: ClockDataSchema,
  srSummary: (_data, facts) => ringSummary(facts),
  table: (data, _facts, settings) => hoursTable(data.hours, settings),
  // The peak hour and the parts of the day; the 24 hours stay in the Table sheet and the Notes.
  article: (data, facts, ctx) => [
    heading(headline("clock", facts), facts),
    ...deckBlock(pageDeck(ctx, facts, "clock"), facts, ["hours.peak", "hours.afterDarkShare", "hours.goldenShare"]),
    { kind: "table", table: dayPartsTable(data.hours, ctx) },
  ],
  share: { facts: ["hours.peak", "hours.afterDarkShare", "hours.quietest"] },
}
