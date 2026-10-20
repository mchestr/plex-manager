import { useId } from "react"

import { RewindFigure } from "@/components/rewind/a11y/figure"
import { formatDayMonth } from "@/lib/rewind/format"
import { calendarDays, calendarPage, GRID_ACTIVE_DAYS } from "@/lib/rewind/pages/calendar"
import type { CalendarData } from "@/lib/rewind/pages/calendar.schema"
import { has, num, shown } from "@/lib/rewind/pages/facts"
import { calendarGrid, type CalendarCell } from "@/lib/rewind/viz/calendar"
import { headline } from "@/lib/wrapped/copy/templates"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { CopyText } from "./copy-text"
import { HatchDefs } from "./hatch"
import { deckText, type PageProps } from "./issue-context"
import { axes, u, ut } from "./units"

const CELL = 9
const GAP = 2.5

const str = (facts: RewindFactsV3, id: "streak.longest.from" | "streak.longest.to" | "days.biggest.date") => {
  const value = facts[id]?.value
  return typeof value === "string" ? value : null
}

function Cell({ cell, hatch }: { cell: CalendarCell; hatch: string }) {
  const fill = cell.step === "solid" ? "currentColor" : cell.step === "hatch" ? `url(#${hatch})` : "none"
  return <rect x={cell.x + 0.5} y={cell.y + 0.5} width={CELL - 1} height={CELL - 1} rx={1} fill={fill} stroke="currentColor" strokeWidth={cell.step === "solid" ? 0 : 1} />
}

/** The year's grid, with the streak bracketed, the biggest day ringed and the longest gap dotted. */
function Grid({ days, gap, facts }: { days: ReadonlyArray<{ date: string; minutes: number }>; gap: CalendarData["gap"]; facts: RewindFactsV3 }) {
  const hatch = useId()
  const grid = calendarGrid(days, {
    cell: CELL,
    gap: GAP,
    streak: num(facts, "streak.longest.days") >= 2 && str(facts, "streak.longest.from") ? { from: str(facts, "streak.longest.from")!, to: str(facts, "streak.longest.to")! } : null,
    biggest: str(facts, "days.biggest.date"),
    longestGap: gap,
  })
  const rows = Array.from({ length: grid.rows }, (_, i) => grid.cells.filter((cell) => cell.month - grid.cells[0].month === i))

  return (
    <svg aria-hidden viewBox={`-2 -4 ${grid.width + 4} ${grid.height + 8}`} className="block w-full overflow-visible" style={{ height: u(grid.height + 8) }}>
      <HatchDefs id={hatch} />
      <g>
        {rows.map((cells, i) => (
          <g key={cells[0].month} className="rw-cal-row" style={{ animationDelay: `${420 + i * 50}ms` }}>
            {cells.map((cell) => (
              <Cell key={cell.date} cell={cell} hatch={hatch} />
            ))}
          </g>
        ))}
        <g className="rw-ring-arc">
          {grid.streak.map((s) => (
            <path key={`${s.x1}-${s.y}`} d={`M${s.x1} ${s.y + 2}V${s.y}H${s.x2}V${s.y + 2}`} fill="none" strokeWidth={1.5} className="stroke-chart-2" />
          ))}
          {grid.biggest && <circle cx={grid.biggest.cx} cy={grid.biggest.cy} r={grid.biggest.r} fill="none" strokeWidth={1.5} className="stroke-chart-2" />}
          {grid.gap.map((s) => (
            <line key={`${s.x1}-${s.y}`} x1={s.x1} x2={s.x2} y1={s.y} y2={s.y} strokeWidth={1.5} strokeDasharray="1.5 2.5" stroke="currentColor" />
          ))}
        </g>
      </g>
    </svg>
  )
}

/** The marks' key: what the bracket, the ring and the dots stand for, from the facts. */
function Key({ facts }: { facts: RewindFactsV3 }) {
  const items = [
    num(facts, "streak.longest.days") >= 2 && { mark: "bracket", text: `Longest run, ${shown(facts, "streak.longest.days")}: ${shown(facts, "streak.longest.from")} to ${shown(facts, "streak.longest.to")}` },
    has(facts, "days.biggest.date") && { mark: "ring", text: `Biggest day, ${shown(facts, "days.biggest.date")}: ${shown(facts, "days.biggest.minutes")}` },
    has(facts, "days.longestGap.days") && { mark: "dots", text: `Longest gap, ${shown(facts, "days.longestGap.days")} in ${shown(facts, "days.longestGap.month")}` },
  ].filter((item): item is { mark: string; text: string } => Boolean(item))
  return (
    <ul aria-hidden className="flex flex-col font-display" style={{ gap: u(4), marginTop: u(10), fontSize: ut(13), fontVariationSettings: axes(100, 600) }}>
      {items.map((item) => (
        <li key={item.mark} className="flex items-center" style={{ gap: u(8) }}>
          <svg viewBox="0 0 20 10" className="shrink-0" style={{ width: u(20), height: u(10) }}>
            {item.mark === "bracket" && <path d="M1 8V2H19V8" fill="none" strokeWidth={1.5} className="stroke-chart-2" />}
            {item.mark === "ring" && <circle cx={10} cy={5} r={4} fill="none" strokeWidth={1.5} className="stroke-chart-2" />}
            {item.mark === "dots" && <line x1={1} x2={19} y1={5} y2={5} strokeWidth={1.5} strokeDasharray="1.5 2.5" stroke="currentColor" />}
          </svg>
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * 10 The calendar (design 4.3): the streak headline ("23 days without a
 * night off"), the deck, the grid of 9 px cells in four print steps, not
 * interactive in story mode, and the key to its marks. Under 5 active days
 * the page lists the active dates in one row instead.
 */
export function CalendarPage({ data, issue }: PageProps<CalendarData>) {
  const { facts, locale } = issue
  const days = calendarDays(data, facts)
  const played = days.filter((day) => day.minutes > 0)

  return (
    <div className="flex h-full flex-col font-text" style={{ padding: `${u(4)} ${u(16)} ${u(12)}` }} data-testid="rewind-page-calendar">
      <h2 tabIndex={-1} className="font-lead outline-none" style={{ fontSize: u(40), lineHeight: 1.02, letterSpacing: "-0.01em" }}>
        <CopyText text={headline("calendar", facts)} source={facts} />
      </h2>
      <p style={{ fontSize: u(18.5), lineHeight: 1.3, marginTop: u(12) }}>
        <CopyText text={deckText(issue, "calendar")} source={facts} />
      </p>
      <RewindFigure summary={calendarPage.srSummary(data, facts)} className="mt-auto">
        {played.length < GRID_ACTIVE_DAYS ? (
          <ol className="flex flex-wrap font-display tabular-nums" style={{ gap: u(8), fontSize: u(22), fontVariationSettings: axes(75, 900) }} data-testid="rewind-calendar-dates">
            {played.map((day) => (
              <li key={day.date} className="rounded-sm border-[1.5px] border-current" style={{ padding: `${u(4)} ${u(10)}` }}>
                {formatDayMonth(day.date, { locale })}
              </li>
            ))}
          </ol>
        ) : (
          <>
            <Grid days={days} gap={data.gap} facts={facts} />
            <Key facts={facts} />
          </>
        )}
      </RewindFigure>
      {/* P8.3 adds "Pick a day" (rewind-day-picker, FR-9) here, reading only this page's stored days and titles. */}
    </div>
  )
}
