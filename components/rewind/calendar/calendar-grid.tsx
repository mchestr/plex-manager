"use client"

import { useRef, useState, type KeyboardEvent } from "react"

import { ArticleTable } from "@/components/rewind/article/article-table"
import { useIsClient } from "@/hooks/use-is-client"
import type { CalendarGridMonth } from "@/lib/rewind/article/blocks"
import type { PageTable } from "@/lib/rewind/registry"
import { cn } from "@/lib/utils"

interface CalendarGridProps {
  caption: string
  /** P5.12's month tables: the server render, readable without JavaScript. */
  tables: readonly PageTable[]
  months: readonly CalendarGridMonth[]
}

type Position = readonly [row: number, column: number]

const dayOfMonth = (date: string) => Number(date.slice(8, 10))

/** A cell's print step, from its minutes: empty, light, mid or solid. */
const step = (minutes: number) => (minutes === 0 ? "" : minutes < 60 ? "bg-current/25" : minutes < 180 ? "bg-current/60" : "bg-current")

/**
 * The calendar grid (P8.3, FR-9) in the desktop Notes. The
 * server renders the month tables; once hydrated, the island becomes a
 * `grid` of month rows (the month is the `rowheader`) and 24 px day cells
 * with a roving `tabindex`: one cell is 0 and the rest -1. Left and Right
 * move a day, Up and Down move to the same date in the month above or below
 * (clamped to that month's last day), Home and End go to the row's ends.
 * Each cell is labelled with its day-row text, and Enter or a click shows
 * it in the line under the grid. The stage's keymap leaves these keys to
 * the grid (`isCompositeWidgetTarget`).
 */
export function CalendarGrid({ caption, tables, months }: CalendarGridProps) {
  const client = useIsClient()
  const cells = useRef(new Map<string, HTMLTableCellElement>())
  const [focus, setFocus] = useState<Position>([0, 0])
  const [detail, setDetail] = useState("")

  if (!client) {
    return (
      <div className="flex flex-col gap-6">
        {tables.map((table) => (
          <ArticleTable key={table.caption} table={table} />
        ))}
      </div>
    )
  }

  const move = ([row, column]: Position) => {
    const days = months[row]?.days
    if (!days) return
    const next: Position = [row, Math.max(0, Math.min(days.length - 1, column))]
    setFocus(next)
    cells.current.get(days[next[1]].date)?.focus()
  }

  /** The column of the same date in `row`, clamped to its first and last day. */
  const sameDate = (row: number, date: string) => {
    const days = months[row].days
    const exact = days.findIndex((day) => dayOfMonth(day.date) === dayOfMonth(date))
    if (exact !== -1) return exact
    return dayOfMonth(date) > dayOfMonth(days[days.length - 1].date) ? days.length - 1 : 0
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTableCellElement>, row: number, column: number) => {
    const date = months[row].days[column].date
    const keys: Record<string, () => void> = {
      ArrowRight: () => move([row, column + 1]),
      ArrowLeft: () => move([row, column - 1]),
      ArrowDown: () => row < months.length - 1 && move([row + 1, sameDate(row + 1, date)]),
      ArrowUp: () => row > 0 && move([row - 1, sameDate(row - 1, date)]),
      Home: () => move([row, 0]),
      End: () => move([row, months[row].days.length - 1]),
      Enter: () => setDetail(months[row].days[column].label),
    }
    const action = keys[event.key]
    if (!action) return
    event.preventDefault()
    action()
  }

  return (
    <div className="flex flex-col gap-3" data-testid="rewind-calendar-grid">
      <div className="overflow-x-auto pb-1">
        <table role="grid" aria-label={caption} className="border-separate border-spacing-0.5">
          <tbody>
            {months.map((month, r) => (
              <tr key={month.label} role="row">
                <th role="rowheader" scope="row" className="pr-2 text-left font-display text-sm font-semibold whitespace-nowrap">
                  {month.label}
                </th>
                {month.days.map((day, c) => (
                  <td
                    key={day.date}
                    ref={(el) => {
                      if (el) cells.current.set(day.date, el)
                      else cells.current.delete(day.date)
                    }}
                    role="gridcell"
                    tabIndex={focus[0] === r && focus[1] === c ? 0 : -1}
                    aria-label={day.label}
                    data-testid="rewind-calendar-cell"
                    className={cn("size-6 min-w-6 cursor-pointer rounded-sm border border-current/50 outline-none focus-visible:ring-[3px] focus-visible:ring-ring", step(day.minutes))}
                    onKeyDown={(event) => onKeyDown(event, r, c)}
                    onFocus={() => setFocus([r, c])}
                    onClick={() => setDetail(day.label)}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p aria-live="polite" className="min-h-6" data-testid="rewind-calendar-detail">
        {detail}
      </p>
    </div>
  )
}
