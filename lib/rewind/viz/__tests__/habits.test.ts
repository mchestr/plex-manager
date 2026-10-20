/**
 * @jest-environment node
 */

import { calendarGrid, cellStep } from "@/lib/rewind/viz/calendar"
import { calendarDots, mondayIndex } from "@/lib/rewind/viz/calendar-dots"
import { barLengths, hourRing, inWindow } from "@/lib/rewind/viz/hour-ring"
import { meter } from "@/lib/rewind/viz/meter"
import { shelf } from "@/lib/rewind/viz/shelf"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"

jest.mock("server-only", () => ({}))

const HISTOGRAM = [40, 30, 20, 10, 1, 0, 0, 2, 4, 5, 6, 7, 9, 10, 11, 14, 18, 25, 33, 45, 60, 70, 100, 64]

function windowDays(from: string, through: string, minutes: (date: string, i: number) => number) {
  const out: Array<{ date: string; minutes: number }> = []
  for (let t = Date.parse(`${from}T00:00:00Z`), i = 0; t <= Date.parse(`${through}T00:00:00Z`); t += 86_400_000, i++) {
    const date = new Date(t).toISOString().slice(0, 10)
    out.push({ date, minutes: minutes(date, i) })
  }
  return out
}

describe("hourRing", () => {
  const ring = hourRing(HISTOGRAM, { size: 256, arc: { from: 22, to: 3 }, peak: 22, gutter: 51 })

  it("puts midnight at the top and runs clockwise, 15 degrees an hour", () => {
    expect(ring.bars.map((b) => b.angle)).toEqual(HISTOGRAM.map((_, h) => h * 15))
    expect(ring.labels.find((l) => l.hour === 0)).toMatchObject({ x: 128, y: 0 })
    expect(ring.labels.find((l) => l.hour === 6)).toMatchObject({ x: 256, y: 128 })
  })

  it("spans the arc from 22:00 to 03:59, wrapping past midnight", () => {
    expect(ring.arc.startAngle).toBe(22 * 15 - 7.5)
    expect(ring.arc.endAngle).toBe(4 * 15 - 7.5 + 360)
    expect(ring.bars.filter((b) => b.inArc).map((b) => b.hour)).toEqual([0, 1, 2, 3, 22, 23])
    expect([21, 4].map((h) => inWindow(h, { from: 22, to: 3 }))).toEqual([false, false])
    expect(inWindow(19, { from: 18, to: 21 })).toBe(true)
  })

  it("draws square-root bar lengths above a nub", () => {
    const lengths = barLengths(HISTOGRAM, 256)
    const min = 2.5
    const span = 56 - min
    expect(lengths[22]).toBe(56)
    expect(lengths[5]).toBe(min)
    expect((lengths[21] - min) / span).toBeCloseTo(Math.sqrt(70 / 100), 3)
    expect((lengths[3] - min) / span).toBeCloseTo(Math.sqrt(10 / 100), 3)
  })

  it("leads from the peak to the nearer side", () => {
    expect(ring.leader).toMatchObject({ side: "left", x: -51 })
    expect(hourRing(HISTOGRAM, { size: 256, arc: { from: 18, to: 21 }, peak: 2, gutter: 10 }).leader).toMatchObject({ side: "right", x: 266 })
    expect(hourRing(HISTOGRAM, { size: 256, arc: { from: 18, to: 21 }, peak: null, gutter: 10 }).leader).toBeNull()
  })

  it("is deterministic", () => {
    expect(hourRing(HISTOGRAM, { size: 256, arc: { from: 22, to: 3 }, peak: 22, gutter: 51 })).toEqual(ring)
  })
})

describe("calendarGrid", () => {
  const opts = { cell: 9, gap: 2.5, streak: null, biggest: null, longestGap: null }

  it("sets each day in its print step against the median played day", () => {
    const days = windowDays("2026-01-01", "2026-01-06", (_d, i) => [0, 10, 20, 30, 40, 0][i])
    const grid = calendarGrid(days, opts)
    expect(grid.cells.map((c) => c.step)).toEqual(["outline", "hatch", "hatch", "solid", "solid", "outline"])
    expect(cellStep(0, 5)).toBe("outline")
  })

  it("lays out month rows and day columns, with 29 February only in a leap year", () => {
    const leap = calendarGrid(windowDays("2028-01-01", "2028-11-30", () => 5), opts)
    const common = calendarGrid(windowDays("2026-01-01", "2026-11-30", () => 5), opts)
    expect(leap.rows).toBe(11)
    expect(leap.cells.find((c) => c.date === "2028-02-29")).toMatchObject({ month: 2, day: 29, x: 28 * 11.5, y: 11.5 })
    expect(common.cells.some((c) => c.date.endsWith("02-29"))).toBe(false)
    expect(leap.cells).toHaveLength(335)
    expect(common.cells).toHaveLength(334)
    expect(common.width).toBe(31 * 11.5 - 2.5)
  })

  it("brackets a streak across a month end, rings the biggest day and dots the gap", () => {
    const days = windowDays("2026-01-01", "2026-03-31", () => 5)
    const grid = calendarGrid(days, { ...opts, streak: { from: "2026-01-30", to: "2026-02-02" }, biggest: "2026-03-04", longestGap: { from: "2026-03-10", to: "2026-03-12" } })
    expect(grid.streak).toEqual([
      { x1: 29 * 11.5, x2: 30 * 11.5 + 9, y: -1.25 },
      { x1: 0, x2: 11.5 + 9, y: 11.5 - 1.25 },
    ])
    expect(grid.biggest).toEqual({ cx: 3 * 11.5 + 4.5, cy: 23 + 4.5, r: 7.65 })
    expect(grid.gap).toEqual([{ x1: 9 * 11.5, x2: 11 * 11.5 + 9, y: 23 + 9 + 1.25 }])
  })
})

describe("meter", () => {
  it("splits the bar at the ratio and ticks the median", () => {
    expect(meter(0.25, { width: 200, height: 20, median: 0.5 })).toEqual({ solid: { x: 0, width: 50 }, rest: { x: 50, width: 150 }, tick: 100, height: 20 })
    expect(meter(1.4, { width: 200, height: 20, median: null })).toMatchObject({ solid: { width: 200 }, tick: null })
  })
})

describe("calendarDots", () => {
  it("puts Monday on the first row and fills weekends solid for the Weekend Double Feature", () => {
    const days = windowDays("2026-01-01", "2026-01-11", (_d, i) => (i === 1 ? 0 : 30))
    const { dots, columns } = calendarDots(days, { width: 70, height: 70, solid: (weekday) => weekday >= 5 })
    expect(mondayIndex("2026-01-05")).toBe(0)
    expect(columns).toBe(2)
    expect(dots.find((d) => d.date === "2026-01-03")!.step).toBe("solid")
    expect(dots.find((d) => d.date === "2026-01-01")!.step).toBe("outline")
    expect(dots.find((d) => d.date === "2026-01-02")!.step).toBe("empty")
    expect(dots.find((d) => d.date === "2026-01-05")).toMatchObject({ cx: 15, cy: 5 })
  })
})

describe("shelf", () => {
  it("fits each title along its spine without breaking a word", () => {
    const spines = shelf(
      [
        { title: "Severance", mark: null },
        { title: "The Lord of the Rings: The Rings of Power", mark: "x2" },
      ],
      { width: 120, height: 200, metrics: pageMetrics }
    )
    expect(spines).toHaveLength(2)
    expect(spines[1].x).toBe(62)
    expect(spines.map((s) => s.fit.lines.length)).toEqual([1, 1])
    expect(spines[0].fit.lines[0].text).toBe("Severance")
    expect(spines[1].fit.ariaLabel).toBe("The Lord of the Rings: The Rings of Power")
    expect(spines[1].mark).toBe("x2")
  })
})
