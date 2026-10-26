import { DEFAULT_TIERS, limitCopy, requestTiersSchema, tierIndexFor, tierProgress, tiersFromConfig } from "../tiers"

describe("tierIndexFor", () => {
  it.each([
    [0, 0],
    [24, 0],
    [24.01, 1],
    [50, 1],
    [50.5, 2],
    [100, 2],
    [100.1, 3],
    [200, 3],
    [200.01, 4],
    [5000, 4],
  ])("puts %s hours in tier index %s", (hours, index) => {
    expect(tierIndexFor(hours, DEFAULT_TIERS)).toBe(index)
  })
})

describe("tierProgress", () => {
  it("measures the way through the current band", () => {
    const progress = tierProgress(37, DEFAULT_TIERS)
    expect(progress.index).toBe(1)
    expect(progress.next).toEqual(DEFAULT_TIERS[2])
    expect(progress.hoursToNext).toBe(13)
    expect(progress.percent).toBe(50)
  })

  it("starts the first band at zero hours", () => {
    expect(tierProgress(12, DEFAULT_TIERS)).toMatchObject({ index: 0, hoursToNext: 12, percent: 50 })
  })

  it("is full with no next tier at the top", () => {
    expect(tierProgress(300, DEFAULT_TIERS)).toMatchObject({ index: 4, next: null, hoursToNext: null, percent: 100 })
  })
})

describe("requestTiersSchema", () => {
  it("accepts the defaults", () => {
    expect(requestTiersSchema.safeParse(DEFAULT_TIERS).success).toBe(true)
  })

  it("needs the first tier at 0 hours", () => {
    expect(requestTiersSchema.safeParse([{ overHours: 5, movieLimit: 1, tvLimit: 1, days: 7 }]).success).toBe(false)
  })

  it("needs rising thresholds", () => {
    const tiers = [
      { overHours: 0, movieLimit: 1, tvLimit: 1, days: 7 },
      { overHours: 10, movieLimit: 2, tvLimit: 1, days: 7 },
      { overHours: 10, movieLimit: 3, tvLimit: 1, days: 7 },
    ]
    expect(requestTiersSchema.safeParse(tiers).success).toBe(false)
  })

  it("rejects a period of zero days and no tiers", () => {
    expect(requestTiersSchema.safeParse([{ overHours: 0, movieLimit: 1, tvLimit: 1, days: 0 }]).success).toBe(false)
    expect(requestTiersSchema.safeParse([]).success).toBe(false)
  })
})

describe("tiersFromConfig", () => {
  it("uses the defaults while nothing valid is stored", () => {
    expect(tiersFromConfig(null)).toBe(DEFAULT_TIERS)
    expect(tiersFromConfig([{ overHours: 3 }])).toBe(DEFAULT_TIERS)
  })

  it("uses the stored tiers", () => {
    const stored = [{ overHours: 0, movieLimit: 9, tvLimit: 9, days: 30 }]
    expect(tiersFromConfig(stored)).toEqual(stored)
  })
})

describe("limitCopy", () => {
  it("names unlimited, one and many", () => {
    expect(limitCopy(0, "movies")).toBe("unlimited movies")
    expect(limitCopy(1, "shows")).toBe("1 show")
    expect(limitCopy(4, "movies")).toBe("4 movies")
  })
})
