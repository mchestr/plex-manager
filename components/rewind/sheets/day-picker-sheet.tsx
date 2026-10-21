"use client"

import { useState } from "react"

import { useStageSheet } from "@/components/rewind/stage/player-context"
import { Button } from "@/components/ui/button"
import { Segment, SegmentedControl } from "@/components/ui/segmented-control"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { CalendarDayRow } from "@/lib/rewind/pages/calendar"

/** The player's name for this sheet. */
const DAY_PICKER_SHEET = "day-picker"

interface DayPickerProps {
  /** Every day of the window, built on the server from the page data. */
  days: readonly CalendarDayRow[]
  /** The month the sheet opens on: the biggest day's. */
  initialMonth: number
  locale: string
}

/**
 * "Pick a day" (P8.3, FR-9): the 44 px button under the calendar, and the
 * bottom sheet it opens. The month selector is a `SegmentedControl` in two
 * rows of three-letter months, and each day of the chosen month is a 44 px
 * row ("Jul 4, 12 h 24 m, mostly The Bear", or "no plays"). The sheet is a
 * player sheet, so opening it pauses the story and closing it resumes only
 * if the story was playing.
 */
export function DayPicker({ days, initialMonth, locale }: DayPickerProps) {
  const sheet = useStageSheet(DAY_PICKER_SHEET)
  const months = [...new Set(days.map((day) => day.month))]
  const [month, setMonth] = useState(months.includes(initialMonth) ? initialMonth : (months.at(-1) ?? 1))
  const short = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" })
  const long = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" })
  const name = (m: number, format: Intl.DateTimeFormat) => format.format(Date.UTC(2026, m - 1, 1))
  const shown = days.filter((day) => day.month === month)

  return (
    <>
      <Button
        variant="ink-outline"
        size="pill"
        aria-haspopup="dialog"
        data-rw-interactive
        data-testid="rewind-day-picker"
        className="self-start"
        style={{ marginTop: "calc(var(--u) * 12px)" }}
        onClick={sheet.show}
      >
        Pick a day
      </Button>
      <Sheet open={sheet.open} onOpenChange={(next) => !next && sheet.close()}>
        <SheetContent side="bottom" grabber data-testid="rewind-day-picker-sheet" className="font-display">
          <SheetHeader>
            <SheetTitle>Pick a day</SheetTitle>
          </SheetHeader>
          <SegmentedControl
            aria-label="Month"
            value={String(month)}
            onValueChange={(value) => setMonth(Number(value))}
            className="grid w-full grid-cols-6"
            data-testid="rewind-day-picker-months"
          >
            {months.map((m) => (
              <Segment key={m} value={String(m)} aria-label={name(m, long)} className="h-11">
                {name(m, short)}
              </Segment>
            ))}
          </SegmentedControl>
          <ul aria-label={name(month, long)} className="flex flex-col text-ui" data-testid="rewind-day-picker-days">
            {shown.map((day) => (
              <li key={day.date} className="flex min-h-11 items-center border-b border-border tabular-nums" data-testid="rewind-day-picker-row">
                <span>
                  {day.day}
                  {day.watched ? `, ${day.watched}` : ", no plays"}
                  {day.title && (
                    <>
                      , mostly{" "}
                      <i dir="auto" className="font-text">
                        {day.title}
                      </i>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  )
}
