/**
 * 09 The clock (design 4.3): when the member presses play, as the evidence
 * clock with the after-dark window bracketed, and a weekday row. Kept with
 * more than 10 counted plays; its Table lists the 24 hours.
 *
 * @module lib/rewind/pages/clock
 */

import { formatCount, formatHour, formatShare } from "@/lib/rewind/format"
import type { PageDefinition, PageTable } from "@/lib/rewind/registry"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { ClockDataSchema, type ClockData } from "./clock.schema"
import { has, shown } from "./facts"

/** Design 4.3: the clock needs more than 10 counted plays. @internal */
export const CLOCK_PLAYS = 10

/** "Times in America/Chicago." for a caption or a summary. */
const zoneSentence = (facts: RewindFactsV3) => `Times in ${shown(facts, "tz.label")}.`

/** Sunday-first weekday shares, Monday first. */
const mondayFirst = (shares: readonly number[]) => [...shares.slice(1), shares[0]]

/** The 24 hours as a table: the clock's and the centrefold's Table (P5.3 contract). */
export function hoursTable(hours: readonly number[], facts: RewindFactsV3, settings: { locale: string }): PageTable {
  const total = hours.reduce((sum, n) => sum + n, 0)
  return {
    caption: `Plays by the hour they started, from ${shown(facts, "window.from")} to ${shown(facts, "window.through")}. ${zoneSentence(facts)}`,
    columns: ["Hour", "Plays", "Share"],
    rows: hours.map((n, hour) => [
      formatHour(hour, settings),
      formatCount(n, { one: "play", other: "plays" }, settings),
      total > 0 ? formatShare(n / total, settings) : "",
    ]),
  }
}

const WINDOWS: Partial<Record<FactId, string>> = {
  "hours.afterDarkShare": "between 10 PM and 4 AM",
  "hours.goldenShare": "between 6 PM and 10 PM",
}

/** The ring's text alternative, naming the share its arc brackets. */
export function ringSummary(facts: RewindFactsV3, share: FactId = "hours.afterDarkShare"): string {
  const parts = [`Plays by the hour they started. ${zoneSentence(facts)}`]
  if (has(facts, share)) parts.push(`${shown(facts, share)} of your plays started ${WINDOWS[share]}.`)
  if (has(facts, "hours.peak")) parts.push(`Your busiest hour was ${shown(facts, "hours.peak")}, and your quietest ${shown(facts, "hours.quietest")}.`)
  return parts.join(" ")
}

export const clockPage: PageDefinition<ClockData> = {
  select: (_facts, { stats }) =>
    stats.plays > CLOCK_PLAYS && stats.time.peak !== null ? { hours: [...stats.time.histogram], weekdays: mondayFirst(stats.time.weekdayShare) } : null,
  schema: ClockDataSchema,
  srSummary: (_data, facts) => ringSummary(facts),
  table: (data, facts, settings) => hoursTable(data.hours, facts, settings),
  share: { facts: ["hours.peak", "hours.afterDarkShare", "hours.quietest", "tz.label"] },
}
