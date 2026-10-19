/**
 * The calendar page's facts (page 10): minutes per day, active days, the
 * biggest day, the longest streak, the longest gap and each day's top title.
 *
 * A play belongs to the day it started on in the member's zone, so a play
 * that starts at 23:30 on 31 December stays on 31 December. A day is active
 * when it holds a counted play (FR-46); minutes count every play.
 *
 * @module lib/wrapped/stats/calendar
 */

import { isCountedPlay, type PlayEvent } from "@/lib/wrapped/sources/watch-history-source"
import { dayKey, type TimeWindow } from "@/lib/wrapped/time/zone"

import { addDays, daysBetween, windowDays } from "./days"
import { minutesOf, videoEvents, type StatsContext, type TitleKey } from "./keys"
import { rankTitles } from "./rank"

export interface DayMinutes {
  date: string
  minutes: number
}

export interface CalendarStats {
  /** Every day of the window, in order, with its minutes. */
  minutes: DayMinutes[]
  active: number
  biggest: DayMinutes | null
  streak: { days: number; from: string; to: string } | null
  /** The longest run of inactive days between two active days; `month` is its first day's, 1-12. */
  longestGap: { days: number; from: string; to: string; month: number } | null
  /** Each active day's top listed title by minutes. */
  topTitle: Array<{ date: string; key: TitleKey; title: string; minutes: number }>
}

function groupByDay(events: readonly PlayEvent[], zone: string): Map<string, PlayEvent[]> {
  const days = new Map<string, PlayEvent[]>()
  for (const e of videoEvents(events)) {
    const key = dayKey(e.startedAt, zone)
    const plays = days.get(key)
    if (plays) plays.push(e)
    else days.set(key, [e])
  }
  return days
}

/**
 * Minutes for every day of `window`, each day's seconds floored once.
 * Totals reuse it for the 2025 comparison strip (`days.minutes2025[]`).
 */
export function dailyMinutes(events: readonly PlayEvent[], window: TimeWindow): DayMinutes[] {
  const byDay = groupByDay(events, window.zone)
  return windowDays(window).map((date) => ({
    date,
    minutes: minutesOf((byDay.get(date) ?? []).reduce((sum, e) => sum + e.playSeconds, 0)),
  }))
}

function longestRun(active: string[]): CalendarStats["streak"] {
  let best: CalendarStats["streak"] = null
  let from = active[0]
  for (let i = 0; i < active.length; i++) {
    if (i > 0 && daysBetween(active[i - 1], active[i]) !== 1) from = active[i]
    const days = daysBetween(from, active[i]) + 1
    if (!best || days > best.days) best = { days, from, to: active[i] }
  }
  return best
}

function longestGap(active: string[]): CalendarStats["longestGap"] {
  let best: CalendarStats["longestGap"] = null
  for (let i = 1; i < active.length; i++) {
    const days = daysBetween(active[i - 1], active[i]) - 1
    if (days > 0 && (!best || days > best.days)) {
      const from = addDays(active[i - 1], 1)
      best = { days, from, to: addDays(active[i], -1), month: Number(from.slice(5, 7)) }
    }
  }
  return best
}

/**
 * @example
 * ```ts
 * const calendar = computeCalendar(events, ctx)
 * calendar.minutes.length // 334 during the season
 * calendar.streak         // { days: 23, from: "2026-03-02", to: "2026-03-24" }
 * ```
 */
export function computeCalendar(events: readonly PlayEvent[], ctx: StatsContext): CalendarStats {
  const minutes = dailyMinutes(events, ctx.window)
  const byDay = groupByDay(events, ctx.zone)
  const active = [...byDay.entries()]
    .filter(([, plays]) => plays.some(isCountedPlay))
    .map(([date]) => date)
    .sort()

  const biggest = minutes.reduce<DayMinutes | null>(
    (best, day) => (day.minutes > 0 && (!best || day.minutes > best.minutes) ? day : best),
    null
  )
  const titles = new Map(rankTitles(events, ctx).map((t) => [t.key, t.title]))
  const topTitle = active.flatMap((date) => {
    const [top] = rankTitles(byDay.get(date)!, ctx)
    return top ? [{ date, key: top.key, title: titles.get(top.key)!, minutes: top.minutes }] : []
  })

  return {
    minutes,
    active: active.length,
    biggest,
    streak: active.length > 0 ? longestRun(active) : null,
    longestGap: longestGap(active),
    topTitle,
  }
}
