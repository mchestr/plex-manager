import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getCostAnalysis, projectThirtyDays } from "@/lib/admin/analytics/cost"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

beforeEach(() => mockReset(prismaMock))

// Partial rows for the selects under test, the way the other metrics tests mock them.
const groupBy = prismaMock.lLMUsage.groupBy as jest.Mock
const findUsage = prismaMock.lLMUsage.findMany as jest.Mock
const findUsers = prismaMock.user.findMany as jest.Mock
const aggregate = prismaMock.lLMUsage.aggregate as jest.Mock

describe("projectThirtyDays", () => {
  it("divides by calendar days, not active days", () => {
    // $0.0874 spent on 4 days of a 30-day window.
    expect(projectThirtyDays(0.0874, 30)).toBeCloseTo(0.0874)
    expect(projectThirtyDays(0.0874, 30)).not.toBeCloseTo((0.0874 / 4) * 30)
    expect(projectThirtyDays(1, 0)).toBe(0)
  })
})

describe("getCostAnalysis", () => {
  const range = { from: "2026-09-18", to: "2026-10-17" }

  beforeEach(() => {
    groupBy.mockResolvedValue([
      { provider: "openai", model: "gpt-5-mini", userId: "u1", _sum: { totalTokens: 1000, cost: 0.0474 }, _count: { _all: 3 } },
      { provider: "openai", model: "gpt-5", userId: "u2", _sum: { totalTokens: 500, cost: 0.04 }, _count: { _all: 1 } },
    ])
    findUsage.mockResolvedValue([
      { createdAt: new Date("2026-09-20T12:00:00Z"), cost: 0.02 },
      { createdAt: new Date("2026-10-01T12:00:00Z"), cost: 0.02 },
      { createdAt: new Date("2026-10-10T12:00:00Z"), cost: 0.0074 },
      // 18:00 Pacific on the 16th: the 17th in UTC.
      { createdAt: new Date("2026-10-17T01:00:00Z"), cost: 0.04 },
    ])
    findUsers.mockResolvedValue([
      { id: "u1", name: "Ana", email: null },
      { id: "u2", name: null, email: "bo@example.com" },
    ])
  })

  it("projects the seeded $0.0874 over 4 active days in 30 to about $0.09", async () => {
    const cost = await getCostAnalysis(range, "UTC")
    expect(cost.totals.cost).toBeCloseTo(0.0874)
    expect(cost.window.keys).toHaveLength(30)
    expect(cost.projected30Days).toBeCloseTo(0.0874, 4)
    expect(cost.projected30Days).toBeLessThan(0.1)
  })

  it("zero-fills every day and buckets in the server zone", async () => {
    const cost = await getCostAnalysis(range, "America/Los_Angeles")
    expect(cost.daily).toHaveLength(30)
    expect(cost.daily.at(-1)).toEqual({ date: "2026-10-17", cost: 0, requests: 0 })
    expect(cost.daily.find((day) => day.date === "2026-10-16")).toEqual({ date: "2026-10-16", cost: 0.04, requests: 1 })
    expect(findUsage).toHaveBeenCalledWith({
      where: { createdAt: { gte: new Date("2026-09-18T07:00:00.000Z"), lt: new Date("2026-10-18T07:00:00.000Z") } },
      select: { createdAt: true, cost: true },
    })
  })

  it("names members and ranks by cost", async () => {
    const cost = await getCostAnalysis(range, "UTC")
    expect(cost.byUser.map((row) => row.name)).toEqual(["Ana", "bo@example.com"])
    expect(cost.byProvider).toEqual([{ provider: "openai", requests: 4, tokens: 1500, cost: expect.closeTo(0.0874) }])
  })

  it("starts at the first call for Any time", async () => {
    aggregate.mockResolvedValue({ _min: { createdAt: new Date("2026-10-15T10:00:00Z") } })
    const cost = await getCostAnalysis(null, "UTC")
    expect(cost.window.from).toBe("2026-10-15")
  })
})
