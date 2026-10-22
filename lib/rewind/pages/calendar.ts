/**
 * 10 The calendar (design 4.3): the whole year at a glance, with the
 * longest streak bracketed, the biggest day ringed and the longest gap
 * underlined. Always kept; under 5 active days the page sets one row of the
 * active dates instead of the grid. Its Table lists the minutes of each day
 * played, month by month.
 *
 * @module lib/rewind/pages/calendar
 */

import { figure, heading, paragraph, plain, tableBlock, type ArticleBlock } from "@/lib/rewind/article/blocks"
import type { RewindFeatureFlags } from "@/lib/rewind/features"
import { formatDayMonth, formatRewindDuration } from "@/lib/rewind/format"
import type { PageDefinition, PageTable } from "@/lib/rewind/registry"
import { headline } from "@/lib/wrapped/copy/templates"
import { formatDayKey } from "@/lib/utils/format"
import { display } from "@/lib/wrapped/facts/display"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { CalendarDataSchema, type CalendarData } from "./calendar.schema"
import { pageDeck } from "./deck"
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

/** One day as "Pick a day" (P8.3) and the calendar grid read it. */
export interface CalendarDayRow {
  date: string
  /** 1 to 12. */
  month: number
  /** "Jul 4" in en-US, "4 Jul" in en-GB. */
  day: string
  minutes: number
  /** "12 h 24 m", or null on a day without plays. */
  watched: string | null
  /** The day's most watched title, or null. */
  title: string | null
  /** The whole row as one line: "4 Jul, 12 h 24 m, mostly The Bear" or "4 Jul, no plays". */
  label: string
}

/**
 * Every day of the window as a row (P8.3), from the stored page data only.
 * A title the member hid (`hiddenKeys`, P7.7) is left out before the
 * regeneration that drops it from the data lands.
 */
export function calendarDayRows(data: CalendarData, facts: RewindFactsV3, settings: { locale: string }, hiddenKeys?: ReadonlySet<string>): CalendarDayRow[] {
  return calendarDays(data, facts).map(({ date, minutes, key }) => {
    const day = formatDayKey(date, "day-month-short", settings).replace(/[ \u202F]/g, "\u00A0")
    const watched = minutes > 0 ? formatRewindDuration(minutes, settings) : null
    const title = watched && key && !hiddenKeys?.has(key) ? (data.titles[key] ?? null) : null
    const label = !watched ? `${day}, no plays` : title ? `${day}, ${watched}, mostly ${title}` : `${day}, ${watched}`
    return { date, month: Number(date.slice(5, 7)), day, minutes, watched, title, label }
  })
}

const COLUMNS = ["Day", "Watched", "Most watched"]

/** The days played as Table rows, each with its month. */
function playedRows(data: CalendarData, facts: RewindFactsV3, settings: { locale: string }) {
  return calendarDays(data, facts)
    .filter((day) => day.minutes > 0)
    .map((day) => ({
      month: Number(day.date.slice(5, 7)),
      row: [formatDayMonth(day.date, settings), formatRewindDuration(day.minutes, settings), day.key ? data.titles[day.key] : ""],
    }))
}

/**
 * Article mode's calendar: one table per month with a day played, holding
 * the Table's rows for that month (P8.3 adds the roving-focus grid).
 *
 * @internal Exported for the tests.
 */
export function monthTables(data: CalendarData, facts: RewindFactsV3, settings: { locale: string }): PageTable[] {
  const months = new Map<number, string[][]>()
  for (const { month, row } of playedRows(data, facts, settings)) months.set(month, [...(months.get(month) ?? []), row])
  return [...months].map(([month, rows]) => ({
    caption: `${display("month", month, settings)}: minutes watched on each day you pressed play, by day in ${shown(facts, "tz.label")}.`,
    columns: COLUMNS,
    rows,
  }))
}

/**
 * The day blocks of the Notes and article mode: the month tables, or with
 * `calendar.grid` on (P8.3) one `calendar` block that holds them for the
 * server render and the grid's month rows for the hydrated island.
 */
function dayBlocks(
  data: CalendarData,
  facts: RewindFactsV3,
  ctx: { locale: string; hiddenKeys?: ReadonlySet<string>; features?: Partial<RewindFeatureFlags> }
): ArticleBlock[] {
  const tables = monthTables(data, facts, ctx)
  if (tables.length === 0 || !ctx.features?.["calendar.grid"]) return tables.flatMap(tableBlock)
  const rows = calendarDayRows(data, facts, ctx, ctx.hiddenKeys)
  const months = [...new Set(rows.map((row) => row.month))].map((month) => ({
    label: display("month", month, ctx),
    days: rows.filter((row) => row.month === month),
  }))
  const caption = `Every day from ${shown(facts, "window.from")} to ${shown(facts, "window.through")}, a row per month, by day in ${shown(facts, "tz.label")}. Use the arrow keys to move, and Enter to read a day.`
  return [{ kind: "calendar", caption, tables, months }]
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
    const played = playedRows(data, facts, settings)
    if (played.length === 0) return null
    return {
      caption: `Minutes watched on each day you pressed play, from ${shown(facts, "window.from")} to ${shown(facts, "window.through")}, by day in ${shown(facts, "tz.label")}.`,
      columns: COLUMNS,
      rows: played.map((day) => day.row),
    }
  },
  article: (data, facts, ctx) => [
    heading(headline("calendar", facts), facts),
    paragraph(pageDeck(ctx, facts, "calendar"), facts),
    ...figure(calendarPage.srSummary(data, facts)),
    ...dayBlocks(data, facts, ctx),
  ],
  // Minutes per day, one table per month, or the roving-focus grid under `calendar.grid` (P8.3).
  notes: (data, facts, ctx) => {
    const blocks = dayBlocks(data, facts, ctx)
    return blocks.length > 0 ? [{ kind: "heading", text: plain("Every day you pressed play") }, ...blocks] : figure(calendarPage.srSummary(data, facts))
  },
  share: { facts: ["days.active", "window.elapsedDays", "streak.longest.days", "days.biggest.date", "days.biggest.minutes"] },
}
