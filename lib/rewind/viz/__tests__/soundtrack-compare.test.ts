import { compareSummary, monthsAhead, soundtrackCompare, trailingAverage } from "@/lib/rewind/viz/soundtrack-compare"

const YEAR = { from: "2026-01-01", days: 365 }
const series = (days: number, f: (i: number) => number) => Array.from({ length: days }, (_, i) => f(i))
const opts = { variant: "compare" as const, window: YEAR, width: 365, height: 100 }

/** The ys of a half path's steps, in order. */
const ys = (d: string) => [...d.matchAll(/V(-?[\d.]+)H/g)].map((m) => Number(m[1]))

describe("trailingAverage", () => {
  it("averages each day with the six before it", () => {
    expect(trailingAverage([7, 7, 0, 0, 0, 0, 0, 0])).toEqual([1, 2, 2, 2, 2, 2, 2, 1])
    expect(trailingAverage(series(14, () => 70))).toEqual([10, 20, 30, 40, 50, 60, 70, 70, 70, 70, 70, 70, 70, 70])
  })
})

describe("soundtrackCompare (P8.4)", () => {
  it("matches its documented example", () => {
    const strip = soundtrackCompare([7, 7], [0, 14], { variant: "compare", window: { from: "2026-01-01", days: 2 }, width: 2, height: 4 })
    expect(strip.above).toBe("M0,2V0.59H1V0H2V2Z")
    expect(strip.below).toBe("M0,2V2H1V4H2V2Z")
  })

  it("puts this year above the centre and last year below it, on one shared scale", () => {
    const strip = soundtrackCompare(series(334, () => 60), series(334, () => 240), opts)
    expect(Math.min(...ys(strip.above))).toBeGreaterThan(0)
    expect(Math.max(...ys(strip.above))).toBeLessThanOrEqual(50)
    // Last year's steady 240 is the shared peak: it reaches the edge; this year's 60 reaches half way (square root).
    expect(Math.max(...ys(strip.below))).toBe(100)
    expect(Math.min(...ys(strip.above).slice(10))).toBe(25)
    expect(strip.max).toBe(240)
  })

  it("compares the same window for both years: November 30 in the season, the full year in a whole-year issue", () => {
    expect(soundtrackCompare(series(334, () => 1), series(334, () => 1), opts).days).toBe(334)
    expect(soundtrackCompare(series(334, () => 1), series(365, () => 1), opts).days).toBe(334)
    expect(soundtrackCompare(series(365, () => 1), series(365, () => 1), opts).days).toBe(365)
  })

  it("is deterministic", () => {
    const a = soundtrackCompare(series(334, (i) => (i * 37) % 90), series(334, (i) => (i * 11) % 70), opts)
    const b = soundtrackCompare(series(334, (i) => (i * 37) % 90), series(334, (i) => (i * 11) % 70), opts)
    expect(a).toEqual(b)
    expect(a.above.match(/M/g)).toHaveLength(1)
    expect(a.below.match(/M/g)).toHaveLength(1)
  })

  it("anchors each legend at its year's tallest average", () => {
    const strip = soundtrackCompare(series(334, (i) => (i === 100 ? 700 : 0)), series(334, () => 0), opts)
    expect(strip.legend.above).toEqual({ x: 100, y: 0 })
    expect(strip.legend.below.y).toBe(50)
  })
})

describe("monthsAhead and compareSummary", () => {
  it("counts the months this year led by total minutes", () => {
    expect(monthsAhead([10, 10], [5, 20], "2026-01-01")).toEqual({ ahead: 0, months: 1 })
    const now = series(334, (i) => (i < 31 ? 10 : 100))
    const then = series(334, () => 50)
    expect(monthsAhead(now, then, "2026-01-01")).toEqual({ ahead: 10, months: 11 })
  })

  it("reads as the figure's label", () => {
    expect(compareSummary({ year: 2026, ahead: 9, months: 11 })).toBe("2026 above, 2025 below, as 7-day averages. 2026 was ahead in 9 of 11 months.")
  })
})
