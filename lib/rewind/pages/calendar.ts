/**
 * 10 The calendar (design 4.3): the whole year at a glance, with the
 * longest streak bracketed, the biggest day ringed and the longest gap
 * underlined. Always kept; under 5 active days the page sets one row of the
 * active dates instead of the grid. Its Table lists the minutes of each day
 * played, month by month; article mode gives one line and the days played
 * in each month, and the desktop Notes every day.
 *
 * @module lib/rewind/pages/calendar
 */

import { deckBlock, figure, heading, paragraph, plain, tableBlock, type ArticleBlock } from "@/lib/rewind/article/blocks"
import type { RewindFeatureFlags } from "@/lib/rewind/features"
import { formatDayMonth, formatHero, formatRewindDuration } from "@/lib/rewind/format"
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

/** Days played out of the window's days: the calendar's line, and the cover's in an issue without the calendar. */
export const DAYS_PLAYED = "You pressed play on {{fact:days.active}} of {{fact:window.elapsedDays}}."

/** The facts {@link calendarLine} can print, so the deck never repeats one. */
const CALENDAR_LINE_FACTS = [
  "days.active", "window.elapsedDays", "streak.longest.days", "streak.longest.from", "streak.longest.to",
  "days.biggest.date", "days.biggest.minutes", "days.longestGap.days", "days.longestGap.month",
]

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

/** The Notes' calendar: one table per month with a day played, holding the Table's rows for that month (P8.3 adds the roving-focus grid). */
function monthTables(data: CalendarData, facts: RewindFactsV3, settings: { locale: string }): PageTable[] {
  const months = new Map<number, string[][]>()
  for (const { month, row } of playedRows(data, facts, settings)) months.set(month, [...(months.get(month) ?? []), row])
  return [...months].map(([month, rows]) => ({
    caption: `${display("month", month, settings)}: minutes watched on each day you pressed play.`,
    columns: COLUMNS,
    rows,
  }))
}

/**
 * The day blocks of the Notes: the month tables, or with
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
  const caption = `Every day from ${shown(facts, "window.from")} to ${shown(facts, "window.through")}, a row per month. Use the arrow keys to move. Press Enter to read a day.`
  return [{ kind: "calendar", caption, tables, months }]
}

/** Article mode's one line: the days played, the run (the headline's), the biggest day and the longest gap. */
function calendarLine(facts: RewindFactsV3): string {
  return [
    has(facts, "days.active") && DAYS_PLAYED,
    num(facts, "streak.longest.days") >= 2 && "The run went from {{fact:streak.longest.from}} to {{fact:streak.longest.to}}.",
    has(facts, "days.biggest.date") && "Your biggest day was {{fact:days.biggest.date}}, at {{fact:days.biggest.minutes}}.",
    has(facts, "days.longestGap.days") && "The longest gap was {{fact:days.longestGap.days}}, in {{fact:days.longestGap.month}}.",
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
}

/** Each month of the window with a play, with the days played out of its days in the window: "28 of 31". */
function daysByMonthTable(data: CalendarData, facts: RewindFactsV3, settings: { locale: string }): PageTable {
  const months = new Map<number, { played: number; days: number }>()
  for (const day of calendarDays(data, facts)) {
    const month = Number(day.date.slice(5, 7))
    const count = months.get(month) ?? { played: 0, days: 0 }
    months.set(month, { played: count.played + (day.minutes > 0 ? 1 : 0), days: count.days + 1 })
  }
  return {
    caption: "Days played by month",
    columns: ["Month", "Days played"],
    rows: [...months].filter(([, { played }]) => played > 0).map(([month, { played, days }]) => [display("month", month, settings), `${formatHero(played, settings)} of ${formatHero(days, settings)}`]),
  }
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
      caption: "Minutes watched on each day you pressed play.",
      columns: COLUMNS,
      rows: played.map((day) => day.row),
    }
  },
  // Every day with its minutes and top title stays in the Notes, Pick a day and the Table sheet.
  article: (data, facts, ctx) => {
    const line = calendarLine(facts)
    return [
      heading(headline("calendar", facts), facts),
      ...deckBlock(pageDeck(ctx, facts, "calendar"), facts, CALENDAR_LINE_FACTS),
      ...(line ? [paragraph(line, facts)] : []),
      { kind: "table", table: daysByMonthTable(data, facts, ctx) },
    ]
  },
  // Minutes per day, one table per month, or the roving-focus grid under `calendar.grid` (P8.3).
  notes: (data, facts, ctx) => {
    const blocks = dayBlocks(data, facts, ctx)
    return blocks.length > 0 ? [{ kind: "heading", text: plain("Every day you pressed play") }, ...blocks] : figure(calendarPage.srSummary(data, facts))
  },
  share: { facts: ["days.active", "window.elapsedDays", "streak.longest.days", "days.biggest.date", "days.biggest.minutes"] },
}
