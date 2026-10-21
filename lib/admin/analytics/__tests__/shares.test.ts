import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getShareAnalytics, listShareLinks, shareLinkStatus } from "@/lib/admin/analytics/shares"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

beforeEach(() => mockReset(prismaMock))

const shareCount = prismaMock.rewindShare.count as jest.Mock
const shareFind = prismaMock.rewindShare.findMany as jest.Mock
const visitGroupBy = prismaMock.rewindShareVisitDay.groupBy as jest.Mock
const legacyCount = prismaMock.wrappedShareVisit.count as jest.Mock

const NOW = new Date("2026-10-17T18:00:00Z")

describe("getShareAnalytics", () => {
  beforeEach(() => {
    shareCount.mockResolvedValue(4)
    shareFind.mockResolvedValue([{ createdAt: new Date("2026-10-15T12:00:00Z") }, { createdAt: new Date("2026-10-15T13:00:00Z") }])
    visitGroupBy.mockResolvedValue([
      { day: new Date("2026-10-15T00:00:00Z"), _sum: { count: 5 } },
      { day: new Date("2026-10-16T00:00:00Z"), _sum: { count: 3 } },
    ])
    legacyCount.mockResolvedValue(2)
  })

  it("reads visits from RewindShareVisitDay over the window's days", async () => {
    const stats = await getShareAnalytics({ from: "2026-10-15", to: "2026-10-17" }, "UTC", NOW)

    expect(visitGroupBy).toHaveBeenCalledWith({
      by: ["day"],
      where: { day: { gte: new Date("2026-10-15T00:00:00Z"), lte: new Date("2026-10-17T00:00:00Z") } },
      _sum: { count: true },
    })
    expect(stats.visitsInPeriod).toBe(8)
    expect(stats.linksOn).toBe(4)
    expect(stats.linksCreatedInPeriod).toBe(2)
    expect(stats.averageVisitsPerLink).toBe(2)
    expect(stats.legacyVisitsInPeriod).toBe(2)
  })

  it("zero-fills through today", async () => {
    const stats = await getShareAnalytics({ from: "2026-10-15", to: "2026-10-17" }, "UTC", NOW)
    expect(stats.daily).toEqual([
      { date: "2026-10-15", links: 2, visits: 5 },
      { date: "2026-10-16", links: 0, visits: 3 },
      { date: "2026-10-17", links: 0, visits: 0 },
    ])
  })
})

describe("shareLinkStatus", () => {
  it("is stopped, expired or active", () => {
    expect(shareLinkStatus({ revokedAt: NOW, expiresAt: null }, NOW)).toBe("stopped")
    expect(shareLinkStatus({ revokedAt: null, expiresAt: new Date("2026-10-01") }, NOW)).toBe("expired")
    expect(shareLinkStatus({ revokedAt: null, expiresAt: null }, NOW)).toBe("active")
  })
})

describe("listShareLinks", () => {
  it("keeps the year, counts visits and never returns a token", async () => {
    shareFind.mockResolvedValue([
      {
        id: "s1",
        pages: ["cover", "minutes", "top-shows"],
        createdAt: new Date("2026-10-15T12:00:00Z"),
        expiresAt: null,
        revokedAt: null,
        wrapped: { year: 2025, userId: "u1", user: { id: "u1", name: "Ana", email: null, image: null } },
      },
    ])
    shareCount.mockResolvedValue(1)
    visitGroupBy.mockResolvedValue([{ shareId: "s1", _sum: { count: 7 } }])

    const { rows, total } = await listShareLinks({ page: 1, pageSize: 25, sort: { id: "created", desc: true } }, NOW)

    expect(total).toBe(1)
    expect(rows).toEqual([
      {
        id: "s1",
        userId: "u1",
        memberName: "Ana",
        year: 2025,
        pages: 3,
        createdAt: "2026-10-15T12:00:00.000Z",
        expiresAt: null,
        status: "active",
        visits: 7,
      },
    ])
    const select = shareFind.mock.calls[0][0].select
    expect(select).not.toHaveProperty("tokenHash")
    expect(select).not.toHaveProperty("assetKey")
  })
})
