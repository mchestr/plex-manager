import { milestoneMarks } from "@/lib/rewind/viz/milestones"
import { binsPath, soundtrack, yearDays } from "@/lib/rewind/viz/soundtrack"

const YEAR = { from: "2026-01-01", days: 365 }
/** A deterministic year: a weekly rhythm with a quiet May. */
const minutes = (days: number) => Array.from({ length: days }, (_, i) => (i >= 120 && i < 151 ? 0 : ((i * 37) % 7) * 30 + (i % 3) * 11))

describe("soundtrack", () => {
  it("draws the year as one step-area path, never one shape per day", () => {
    const strip = soundtrack(minutes(334), { variant: "daily", window: YEAR, width: 358, height: 150 })
    expect(strip.d.match(/M/g)).toHaveLength(1)
    expect(strip.d.endsWith("Z")).toBe(true)
    expect(strip.centre).toBe(75)
    const ys = [...strip.d.matchAll(/V(-?[\d.]+)/g)].map((m) => Number(m[1]))
    expect(Math.min(...ys)).toBe(0)
    expect(Math.max(...ys)).toBe(150)
  })

  it("dots December during the season and draws it in a whole-year issue", () => {
    const season = soundtrack(minutes(334), { variant: "daily", window: YEAR, width: 365, height: 100 })
    expect(season.dotted).toEqual({ x1: 334, x2: 365 })
    const final = soundtrack(minutes(365), { variant: "daily", window: YEAR, width: 365, height: 100 })
    expect(final.dotted).toBeNull()
  })

  it("folds the year into 48 weekly bins between 0 and 1", () => {
    const strip = soundtrack(minutes(334), { variant: "weekly", window: YEAR, width: 358, height: 150 })
    expect(strip.bins).toHaveLength(48)
    for (const bin of strip.bins) {
      expect(bin).toBeGreaterThanOrEqual(0)
      expect(bin).toBeLessThanOrEqual(1)
    }
    expect(Math.max(...strip.bins)).toBe(1)
    expect(strip.dotted).not.toBeNull()
    expect(strip.bins.slice(-3)).toEqual([0, 0, 0])
  })

  it("anchors the twelve month initials at each month's first day", () => {
    const strip = soundtrack([], { variant: "daily", window: YEAR, width: 365, height: 100 })
    expect(strip.months.map((m) => m.x)).toEqual([0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334])
    expect(strip.d).toBe("")
  })

  it("is deterministic", () => {
    const a = soundtrack(minutes(334), { variant: "daily", window: YEAR, width: 358, height: 150 })
    const b = soundtrack(minutes(334), { variant: "daily", window: YEAR, width: 358, height: 150 })
    expect(a).toEqual(b)
  })

  it("matches the module's @example", () => {
    const strip = soundtrack([60, 0, 15], { variant: "daily", window: { from: "2026-01-01", days: 4 }, width: 4, height: 2 })
    expect(strip.d).toBe("M0,1V0H1V1H2V0.5H3V1V1.5H2V1H1V2H0V1Z")
    expect(strip.dotted).toEqual({ x1: 3, x2: 4 })
    expect(binsPath([1, 0.5], 2, 2)).toBe("M0,1V0H1V0.5H2V1V1.5H1V2H0V1Z")
  })

  it("counts leap years", () => {
    expect(yearDays("2026-01-01")).toBe(365)
    expect(yearDays("2028-01-01")).toBe(366)
  })
})

describe("milestoneMarks", () => {
  it("matches the module's @example: the centre of each milestone's day", () => {
    expect(milestoneMarks(["2026-01-01", "2026-01-03"], { from: "2026-01-01", days: 4, width: 8 })).toEqual([
      { date: "2026-01-01", x: 1 },
      { date: "2026-01-03", x: 5 },
    ])
  })
})
