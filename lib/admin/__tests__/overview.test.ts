/**
 * The admin Overview's sources (P10.8): each fails alone as `null`, the month
 * window follows the server zone, the season budget and the out-of-season
 * figures.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getAdminOverview, monthWindow, summarizeServices } from "@/lib/admin/overview"
import { getQueueDashboard } from "@/lib/admin/queues"
import { checkDependencies } from "@/lib/health/checks"
import { getConnectionHealth } from "@/lib/settings/connection-health"
import { serverZone } from "@/lib/utils/server-zone"
import { getSeasonCounts } from "@/lib/wrapped/admin/season"
import { getSeasonBudget } from "@/lib/wrapped/admin/season-estimate"
import { getSeasonState } from "@/lib/wrapped/season"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/admin/queues", () => ({ getQueueDashboard: jest.fn() }))
jest.mock("@/lib/health/checks", () => ({ checkDependencies: jest.fn() }))
jest.mock("@/lib/settings/connection-health", () => ({ getConnectionHealth: jest.fn() }))
jest.mock("@/lib/utils/server-zone", () => ({ serverZone: jest.fn() }))
jest.mock("@/lib/wrapped/admin/season", () => ({ getSeasonCounts: jest.fn() }))
jest.mock("@/lib/wrapped/admin/season-estimate", () => ({ getSeasonBudget: jest.fn() }))
jest.mock("@/lib/wrapped/season", () => ({ getSeasonState: jest.fn() }))

const NOW = new Date("2026-12-10T18:00:00Z")
const OPEN = {
  seasonYear: 2026,
  isOpen: true,
  opensAt: new Date("2026-12-01T06:00:00Z"),
  closesAt: new Date("2027-02-01T06:00:00Z"),
}
const COUNTS = { ready: 64, generating: 2, failed: 1, stuck: 0, notStarted: 3, byEdition: {}, byCopySource: {} }

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(getConnectionHealth).mockResolvedValue({
    checkedAt: NOW.toISOString(),
    connections: [
      { id: "plex", label: "Plex", status: "ok" },
      { id: "tautulli", label: "Tautulli", status: "unreachable" },
      { id: "sonarr", label: "Sonarr", status: "notConfigured" },
    ],
  })
  jest.mocked(checkDependencies).mockResolvedValue({ database: "ok", redis: "ok" })
  jest.mocked(getQueueDashboard).mockResolvedValue({
    redisConfigured: true,
    redisConnected: true,
    workerRunning: true,
    paused: false,
    stats: { waiting: 3, active: 0, completed: 10, failed: 2, delayed: 0, paused: 0, prioritized: 0 },
    schedulers: [],
  })
  jest.mocked(serverZone).mockResolvedValue("America/Los_Angeles")
  jest.mocked(getSeasonState).mockResolvedValue(OPEN)
  jest.mocked(getSeasonCounts).mockResolvedValue(COUNTS)
  jest.mocked(getSeasonBudget).mockResolvedValue({ budgetUsd: 10, spentUsd: 4.2 })
  prismaMock.user.count.mockResolvedValue(70)
  prismaMock.rewindView.findMany.mockResolvedValue([])
  prismaMock.lLMUsage.aggregate.mockResolvedValue({ _sum: { cost: 1.25 } } as never)
})

describe("getAdminOverview", () => {
  it("reads all four sources", async () => {
    const overview = await getAdminOverview(NOW)

    expect(overview.services).toEqual({
      working: 3,
      total: 4,
      attention: 0,
      broken: 1,
      worst: { id: "tautulli", label: "Tautulli", status: "unreachable" },
    })
    expect(overview.queues).toEqual({ redisConfigured: true, redisConnected: true, workerRunning: true, failed: 2, waiting: 3 })
    expect(overview.rewind).toMatchObject({ year: 2026, isOpen: true, ready: 64, members: 70, opened: 0 })
    expect(overview.spend).toEqual({
      month: { from: "2026-12-01", to: "2026-12-10" },
      monthUsd: 1.25,
      seasonYear: 2026,
      seasonSpentUsd: 4.2,
      budgetUsd: 10,
    })
  })

  it.each([
    ["services", () => jest.mocked(getConnectionHealth).mockRejectedValue(new Error("boom"))],
    ["queues", () => jest.mocked(getQueueDashboard).mockRejectedValue(new Error("boom"))],
    ["rewind", () => jest.mocked(getSeasonCounts).mockRejectedValue(new Error("boom"))],
    ["spend", () => prismaMock.lLMUsage.aggregate.mockRejectedValue(new Error("boom"))],
  ] as const)("a failed %s source is null and leaves the others", async (source, fail) => {
    fail()
    const overview = await getAdminOverview(NOW)

    expect(overview[source]).toBeNull()
    for (const other of ["services", "queues", "rewind", "spend"] as const) {
      if (other !== source) expect(overview[other]).not.toBeNull()
    }
  })

  it("counts distinct openers of the year's completed Rewinds", async () => {
    prismaMock.rewindView.findMany.mockResolvedValue([{ wrappedId: "w1" }, { wrappedId: "w2" }] as never)
    const overview = await getAdminOverview(NOW)

    expect(overview.rewind?.opened).toBe(2)
    expect(prismaMock.rewindView.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { wrapped: { year: 2026, status: "completed" } }, distinct: ["wrappedId"] })
    )
  })

  it("shows last season's figures outside the season, with the coming opening", async () => {
    const opensAt = new Date("2027-12-01T06:00:00Z")
    jest.mocked(getSeasonState).mockResolvedValue({ seasonYear: 2027, isOpen: false, opensAt, closesAt: new Date("2028-02-01T06:00:00Z") })
    const overview = await getAdminOverview(new Date("2027-03-10T18:00:00Z"))

    expect(overview.rewind).toMatchObject({ year: 2026, isOpen: false, opensAt })
    expect(getSeasonCounts).toHaveBeenCalledWith(2026, expect.any(Number))
    expect(getSeasonBudget).toHaveBeenCalledWith(2027)
  })

  it("sums this month's spend inside the zone's month bounds", async () => {
    await getAdminOverview(NOW)

    expect(prismaMock.lLMUsage.aggregate).toHaveBeenCalledWith({
      where: { createdAt: { gte: new Date("2026-12-01T08:00:00Z"), lt: new Date("2026-12-11T08:00:00Z") } },
      _sum: { cost: true },
    })
  })
})

describe("monthWindow", () => {
  // 05:00Z on 1 November is still 31 October in Los Angeles.
  const firstUtc = new Date("2026-11-01T05:00:00Z")

  it("on the 1st in UTC is that day alone", () => {
    const window = monthWindow(firstUtc, "UTC")
    expect([window.from, window.to]).toEqual(["2026-11-01", "2026-11-01"])
    expect(window.gte.toISOString()).toBe("2026-11-01T00:00:00.000Z")
    expect(window.lt.toISOString()).toBe("2026-11-02T00:00:00.000Z")
  })

  it("on the same instant in Los Angeles is the whole of October", () => {
    const window = monthWindow(firstUtc, "America/Los_Angeles")
    expect([window.from, window.to]).toEqual(["2026-10-01", "2026-10-31"])
    expect(window.gte.toISOString()).toBe("2026-10-01T07:00:00.000Z")
    expect(window.lt.toISOString()).toBe("2026-11-01T07:00:00.000Z")
  })

  it("on the 1st in Los Angeles starts that day", () => {
    const window = monthWindow(new Date("2026-11-01T18:00:00Z"), "America/Los_Angeles")
    expect([window.from, window.to]).toEqual(["2026-11-01", "2026-11-01"])
  })
})

describe("summarizeServices", () => {
  it("leaves services that are off out of the total and prefers broken over attention", () => {
    const summary = summarizeServices([
      { id: "ai", label: "AI", status: "degraded" },
      { id: "plex", label: "Plex", status: "ok" },
      { id: "radarr", label: "Radarr", status: "unreachable" },
      { id: "redis", label: "Redis", status: "notConfigured" },
    ])
    expect(summary).toEqual({
      working: 1,
      total: 3,
      attention: 1,
      broken: 1,
      worst: { id: "radarr", label: "Radarr", status: "unreachable" },
    })
  })

  it("has no worst service when everything works", () => {
    expect(summarizeServices([{ id: "plex", label: "Plex", status: "ok" }]).worst).toBeNull()
  })
})
