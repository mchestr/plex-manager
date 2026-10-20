/**
 * 10 The calendar (design 4.3): the whole year at a glance, with the
 * longest streak bracketed, the biggest day ringed and the longest gap
 * underlined. Always kept; under 5 active days the page sets one row of the
 * active dates instead of the grid. Its Table lists the minutes of each day
 * played, month by month.
 *
 * @module lib/rewind/pages/calendar
 */

import { formatDayMonth, formatRewindDuration } from "@/lib/rewind/format"
import type { PageDefinition } from "@/lib/rewind/registry"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { CalendarDataSchema, type CalendarData } from "./calendar.schema"
import { has, num, shown } from "./facts"

/** Under this many active days the page lists the dates instead of drawing the grid. */
export const GRID_ACTIVE_DAYS = 5

const DAY_MS = 86_400_000

/** The window's days as `{ date, minutes, key }`, dated from `window.from`. */
export function calendarDays(data: CalendarData, facts: RewindFactsV3) {
  const from = facts["window.from"]?.value
  const start = Date.parse(`${typeof from === "string" ? from : "1970-01-01"}T00:00:00Z`)
  return data.days.map((day, i) => ({ ...day, date: new Date(start + i * DAY_MS).toISOString().slice(0, 10) }))
}

export const calendarPage: PageDefinition<CalendarData> = {
  select: (_facts, { stats }) => {
    const top = new Map(stats.calendar.topTitle.map((t) => [t.date, t]))
    const titles: Record<string, string> = {}
    const days = stats.calendar.minutes.map(({ date, minutes }) => {
      const pick = top.get(date)
      if (pick) titles[pick.key] = pick.title
      return { minutes, key: pick?.key ?? null }
    })
    const gap = stats.calendar.longestGap
    return { days, titles, gap: gap ? { from: gap.from, to: gap.to } : null }
  },
  schema: CalendarDataSchema,
  srSummary: (_data, facts) => {
    const parts = [`You pressed play on ${shown(facts, "days.active") || "0"} of ${shown(facts, "window.elapsedDays")}.`]
    if (num(facts, "streak.longest.days") >= 2) {
      parts.push(`Your longest run was ${shown(facts, "streak.longest.days")}, from ${shown(facts, "streak.longest.from")} to ${shown(facts, "streak.longest.to")}.`)
    }
    if (has(facts, "days.biggest.date")) parts.push(`Your biggest day was ${shown(facts, "days.biggest.date")}, at ${shown(facts, "days.biggest.minutes")}.`)
    if (has(facts, "days.longestGap.days")) parts.push(`The longest gap was ${shown(facts, "days.longestGap.days")}, in ${shown(facts, "days.longestGap.month")}.`)
    return parts.join(" ")
  },
  table: (data, facts, settings) => {
    const played = calendarDays(data, facts).filter((day) => day.minutes > 0)
    if (played.length === 0) return null
    return {
      caption: `Minutes watched on each day you pressed play, from ${shown(facts, "window.from")} to ${shown(facts, "window.through")}, by day in ${shown(facts, "tz.label")}.`,
      columns: ["Day", "Watched", "Most watched"],
      rows: played.map((day) => [formatDayMonth(day.date, settings), formatRewindDuration(day.minutes, settings), day.key ? data.titles[day.key] : ""]),
    }
  },
  share: { facts: ["days.active", "window.elapsedDays", "streak.longest.days", "days.biggest.date", "days.biggest.minutes"] },
}
