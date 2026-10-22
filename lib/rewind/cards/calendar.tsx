/**
 * 10 The calendar card (design 6.4), only with Daily detail (FR-35): the
 * card headline, the year as one row of day cells per month from
 * `lib/rewind/viz/calendar` (outline for a day with nothing on, hatched under
 * the median active day, solid from it, the biggest day ringed in the spot),
 * then the active days, the longest streak and the biggest day.
 *
 * The cells come from the projection's daily soundtrack, which it publishes
 * only with Daily detail, so a weekly card can never show which days were
 * watched.
 *
 * @module lib/rewind/cards/calendar
 */

import type { ReactElement } from "react"

import { calendarGrid } from "@/lib/rewind/viz/calendar"
import type { CardInput } from "@/lib/wrapped/data/share-safe"

import { cardInk, Frame, type CardInk } from "./frame"
import { CardHeadline, LABEL, Stat } from "./parts"
import { CARD_MEASURE, Graphic, Line } from "./type"

const CELL = 26
const GAP = 4
const DAY_MS = 86_400_000

/** `YYYY-MM-DD` plus `n` days. */
const addDays = (from: string, n: number) => new Date(Date.parse(`${from}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)

function gridSvg(bins: readonly number[], from: string, ink: CardInk): { svg: string; width: number; height: number } {
  const days = bins.map((minutes, i) => ({ date: addDays(from, i), minutes }))
  const biggest = bins.indexOf(Math.max(...bins))
  const grid = calendarGrid(days, { cell: CELL, gap: GAP, streak: null, biggest: biggest >= 0 && bins[biggest] > 0 ? days[biggest].date : null, longestGap: null })
  const pad = CELL
  const width = grid.width + 2 * pad
  const height = grid.height + 2 * pad
  const cells = grid.cells
    .map((c) => {
      const box = `x="${c.x + pad + 1}" y="${c.y + pad + 1}" width="${CELL - 2}" height="${CELL - 2}" rx="3"`
      if (c.step === "solid") return `<rect ${box} fill="${ink.on}"/>`
      return `<rect ${box} fill="${c.step === "hatch" ? "url(#h)" : "none"}" stroke="${ink.on}" stroke-width="2"/>`
    })
    .join("")
  const ring = grid.biggest
    ? `<circle cx="${grid.biggest.cx + pad}" cy="${grid.biggest.cy + pad}" r="${grid.biggest.r}" fill="none" stroke="${ink.spot}" stroke-width="5"/>`
    : ""
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><pattern id="h" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="8" fill="${ink.on}"/></pattern></defs>` +
    `${cells}${ring}</svg>`
  return { svg, width, height }
}

export function CalendarCard(input: CardInput): ReactElement {
  const ink = cardInk(input)
  const { facts, soundtrack } = input.page
  const grid = soundtrack?.grain === "daily" ? gridSvg(soundtrack.bins, input.window.from, ink) : null
  const scale = grid ? Math.min(1, (CARD_MEASURE + 2 * CELL) / grid.width) : 1
  const active = facts["days.active"]?.display
  const elapsed = facts["window.elapsedDays"]?.display
  const streak = facts["streak.longest.days"]?.display
  const biggest = facts["days.biggest.minutes"]?.display
  const biggestOn = facts["days.biggest.date"]?.display

  return (
    <Frame input={input}>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
        <CardHeadline input={input} measure={CARD_MEASURE} sizeMax={96} maxLines={3} />
      </div>
      {grid ? (
        <div style={{ display: "flex", marginTop: 48, marginLeft: -CELL }}>
          <Graphic svg={grid.svg} width={Math.round(grid.width * scale)} height={Math.round(grid.height * scale)} />
        </div>
      ) : null}
      <div style={{ display: "flex", flexGrow: 1 }} />
      <div style={{ display: "flex", justifyContent: "space-between", width: CARD_MEASURE }}>
        {active ? <Stat value={active} label={elapsed ? `days with something on, of ${elapsed}` : "days with something on"} width={290} /> : null}
        {streak ? <Stat value={streak} label="longest streak" width={290} /> : null}
        {biggest ? <Stat value={biggest} label={biggestOn ? `on ${biggestOn}, the biggest day` : "the biggest day"} width={290} /> : null}
      </div>
      <Line text={`One row per month of ${input.year}, one square per day`} face={{ ...LABEL, size: 27, measure: CARD_MEASURE }} style={{ marginTop: 36 }} />
    </Frame>
  )
}
