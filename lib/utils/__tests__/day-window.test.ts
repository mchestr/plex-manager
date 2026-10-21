import {
  dayKeys,
  dayWindow,
  defaultWindow,
  formatPeriod,
  sumByDay,
  windowSince,
  zeroFill,
} from "@/lib/utils/day-window"

const NOW = Date.parse("2026-10-17T18:00:00Z")

describe("defaultWindow", () => {
  it.each([
    // 18:00Z is 18:00 in UTC, 11:00 in Los Angeles, 20:00 in Berlin and 05:00 on the 18th in Sydney.
    ["UTC", "2026-10-11", "2026-10-17", "2026-10-11T00:00:00.000Z", "2026-10-18T00:00:00.000Z"],
    ["America/Los_Angeles", "2026-10-11", "2026-10-17", "2026-10-11T07:00:00.000Z", "2026-10-18T07:00:00.000Z"],
    ["Europe/Berlin", "2026-10-11", "2026-10-17", "2026-10-10T22:00:00.000Z", "2026-10-17T22:00:00.000Z"],
    ["Australia/Sydney", "2026-10-12", "2026-10-18", "2026-10-11T13:00:00.000Z", "2026-10-18T13:00:00.000Z"],
  ])("counts back from today in %s and includes today", (zone, from, to, gte, lt) => {
    const window = defaultWindow(7, zone, NOW)
    expect([window.from, window.to]).toEqual([from, to])
    expect(window.gte.toISOString()).toBe(gte)
    expect(window.lt.toISOString()).toBe(lt)
    expect(window.keys).toHaveLength(7)
    expect(window.keys.at(-1)).toBe(to)
    expect(window.lt.getTime()).toBeGreaterThan(NOW)
    expect(window.gte.getTime()).toBeLessThanOrEqual(NOW)
  })

  it("is today alone for one day", () => {
    expect(defaultWindow(1, "UTC", NOW).keys).toEqual(["2026-10-17"])
  })
})

describe("dayWindow", () => {
  it("has an inclusive end: the last key is `to` and `lt` is the midnight after it", () => {
    const window = dayWindow({ from: "2026-10-01", to: "2026-10-17" }, "America/Los_Angeles")
    expect(window.keys[0]).toBe("2026-10-01")
    expect(window.keys.at(-1)).toBe("2026-10-17")
    expect(window.keys).toHaveLength(17)
    expect(window.gte.toISOString()).toBe("2026-10-01T07:00:00.000Z")
    expect(window.lt.toISOString()).toBe("2026-10-18T07:00:00.000Z")
  })

  it("spans the spring change as 23 hours, with no skipped key", () => {
    const window = dayWindow({ from: "2026-03-08", to: "2026-03-08" }, "America/Los_Angeles")
    expect(window.keys).toEqual(["2026-03-08"])
    expect(window.lt.getTime() - window.gte.getTime()).toBe(23 * 3_600_000)
  })

  it("spans the autumn change as 25 hours, with no repeated key", () => {
    const window = dayWindow({ from: "2026-10-31", to: "2026-11-02" }, "America/Los_Angeles")
    expect(window.keys).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"])
    expect(window.lt.getTime() - window.gte.getTime()).toBe((24 + 25 + 24) * 3_600_000)
  })

  it("crosses a month and a year", () => {
    expect(dayKeys({ from: "2026-12-30", to: "2027-01-02" })).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"])
  })
})

describe("windowSince", () => {
  it("starts on the zone day of the first row and ends today", () => {
    const window = windowSince(new Date("2026-10-15T03:00:00Z"), "America/Los_Angeles", NOW)
    expect([window.from, window.to]).toEqual(["2026-10-14", "2026-10-17"])
  })

  it("is today when there are no rows", () => {
    expect(windowSince(null, "UTC", NOW).keys).toEqual(["2026-10-17"])
  })
})

describe("sumByDay and zeroFill", () => {
  const rows = [
    { at: new Date("2026-10-17T06:00:00Z"), cost: 0.5 },
    { at: new Date("2026-10-17T08:00:00Z"), cost: 0.25 },
    { at: new Date("2026-10-15T20:00:00Z"), cost: 1 },
  ]

  it("buckets in the zone: 06:00Z is the day before in Los Angeles", () => {
    expect(sumByDay(rows, "America/Los_Angeles", (r) => r.at)).toEqual(
      new Map([
        ["2026-10-16", 1],
        ["2026-10-17", 1],
        ["2026-10-15", 1],
      ]),
    )
    expect(sumByDay(rows, "UTC", (r) => r.at, (r) => r.cost).get("2026-10-17")).toBe(0.75)
  })

  it("fills every key in order and drops days outside them", () => {
    const sums = new Map([
      ["2026-10-15", { cost: 1 }],
      ["2026-10-17", { cost: 0.75 }],
      ["2026-10-01", { cost: 9 }],
    ])
    expect(zeroFill(["2026-10-15", "2026-10-16", "2026-10-17"], sums, { cost: 0 })).toEqual([
      { date: "2026-10-15", cost: 1 },
      { date: "2026-10-16", cost: 0 },
      { date: "2026-10-17", cost: 0.75 },
    ])
  })
})

describe("formatPeriod", () => {
  it("prints the inclusive range", () => {
    expect(formatPeriod({ from: "2026-10-01", to: "2026-10-17" }, { locale: "en-US" })).toBe("Oct 1 – Oct 17, 2026")
    expect(formatPeriod({ from: "2026-10-17", to: "2026-10-17" }, { locale: "en-US" })).toBe("Oct 17, 2026")
    expect(formatPeriod({ from: "2026-12-20", to: "2027-01-02" }, { locale: "en-US" })).toBe("Dec 20, 2026 – Jan 2, 2027")
  })
})

describe("JSDoc examples", () => {
  it("match the documented results", () => {
    const w = dayWindow({ from: "2026-10-01", to: "2026-10-17" }, "America/Los_Angeles")
    expect(w.gte.toISOString()).toBe("2026-10-01T07:00:00.000Z")
    expect(w.keys.length).toBe(17)
    const d = defaultWindow(30, "UTC", Date.parse("2026-10-17T18:00:00Z"))
    expect([d.from, d.to]).toEqual(["2026-09-18", "2026-10-17"])
    expect(sumByDay([{ at: new Date("2026-10-17T06:00:00Z") }], "America/Los_Angeles", (r) => r.at)).toEqual(
      new Map([["2026-10-16", 1]]),
    )
    expect(zeroFill(["2026-10-16", "2026-10-17"], new Map([["2026-10-17", { count: 2 }]]), { count: 0 })).toEqual([
      { date: "2026-10-16", count: 0 },
      { date: "2026-10-17", count: 2 },
    ])
  })
})
